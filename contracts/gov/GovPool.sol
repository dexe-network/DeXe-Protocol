// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";

import "@dlsl/dev-modules/contracts-registry/AbstractDependant.sol";

import "../interfaces/gov/settings/IGovSettings.sol";
import "../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../interfaces/gov/validators/IGovValidators.sol";
import "../interfaces/gov/IGovPool.sol";
import "../interfaces/gov/ERC721/IERC721Expert.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/core/ICoreProperties.sol";
import "../interfaces/core/ISBT721.sol";
import "../interfaces/factory/IPoolFactory.sol";

import "../libs/gov/gov-user-keeper/GovUserKeeperLocal.sol";
import "../libs/gov/gov-pool/GovPoolView.sol";
import "../libs/gov/gov-pool/GovPoolCreate.sol";
import "../libs/gov/gov-pool/GovPoolRewards.sol";
import "../libs/gov/gov-pool/GovPoolVote.sol";
import "../libs/gov/gov-pool/GovPoolUnlock.sol";
import "../libs/gov/gov-pool/GovPoolExecute.sol";
import "../libs/gov/gov-pool/GovPoolMicropoolRewards.sol";
import "../libs/gov/gov-pool/GovPoolOffchain.sol";
import "../libs/math/MathHelper.sol";

import "../core/Globals.sol";

contract GovPool is
    IGovPool,
    AbstractDependant,
    ERC721HolderUpgradeable,
    ERC1155HolderUpgradeable,
    Multicall
{
    using MathHelper for uint256;
    using Math for uint256;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using GovPoolOffchain for *;
    using GovUserKeeperLocal for *;
    using GovPoolView for *;
    using GovPoolCreate for *;
    using GovPoolRewards for *;
    using GovPoolVote for *;
    using GovPoolUnlock for *;
    using GovPoolExecute for *;
    using GovPoolMicropoolRewards for *;

    uint256 public constant PERCENTAGE_MICROPOOL_REWARDS = PERCENTAGE_100 / 5; // 20%

    IGovSettings internal _govSettings;
    IGovUserKeeper internal _govUserKeeper;
    IGovValidators internal _govValidators;
    address internal _distributionProposal;

    ICoreProperties public coreProperties;

    address public nftMultiplier;
    address public expertNft;
    IERC721Expert public dexeExpertNft;
    ISBT721 public babt;

    bool public onlyBABTHolders;

    string public descriptionURL;
    string public name;

    uint256 public latestProposalId;
    uint256 public deployerBABTid;

    OffChain internal _offChain;

    mapping(uint256 => Proposal) internal _proposals; // proposalId => info

    mapping(uint256 => mapping(address => mapping(bool => VoteInfo))) internal _voteInfos; // proposalId => voter => isMicropool => info
    mapping(address => mapping(bool => EnumerableSet.UintSet)) internal _votedInProposals; // voter => isMicropool => active proposal ids

    mapping(address => PendingRewards) internal _pendingRewards; // user => pending rewards
    mapping(address => mapping(bool => MicropoolInfo)) internal _micropoolInfos; // delegatee => isVoteFor => info

    event Delegated(address from, address to, uint256 amount, uint256[] nfts, bool isDelegate);
    event Deposited(uint256 amount, uint256[] nfts, address sender);
    event Withdrawn(uint256 amount, uint256[] nfts, address sender);

    modifier onlyThis() {
        _onlyThis();
        _;
    }

    modifier onlyBABTHolder() {
        _onlyBABTHolder();
        _;
    }

    function __GovPool_init(
        Dependencies calldata govPoolDeps,
        address nftMultiplierAddress,
        address _verifier,
        bool _onlyBABTHolders,
        uint256 _deployerBABTid,
        string calldata _descriptionURL,
        string calldata _name
    ) external initializer {
        _govSettings = IGovSettings(govPoolDeps.settingsAddress);
        _govUserKeeper = IGovUserKeeper(govPoolDeps.userKeeperAddress);
        _govValidators = IGovValidators(govPoolDeps.validatorsAddress);
        _distributionProposal = govPoolDeps.distributionAddress;
        expertNft = govPoolDeps.expertNftAddress;

        if (nftMultiplierAddress != address(0)) {
            _setNftMultiplierAddress(nftMultiplierAddress);
        }

        onlyBABTHolders = _onlyBABTHolders;
        deployerBABTid = _deployerBABTid;

        descriptionURL = _descriptionURL;
        name = _name;

        _offChain.verifier = _verifier;
    }

    function unlock(address user, bool isMicropool) public override onlyBABTHolder {
        _unlock(user, isMicropool);
    }

    function unlockInProposals(
        uint256[] memory proposalIds,
        address user,
        bool isMicropool
    ) public override onlyBABTHolder {
        _unlockInProposals(proposalIds, user, isMicropool);
    }

    function execute(uint256 proposalId) public override onlyBABTHolder {
        _proposals.execute(proposalId);

        _updateRewards(
            proposalId,
            RewardType.Execute,
            _proposals[proposalId].core.settings.rewardsInfo.executionReward
        );
    }

    function deposit(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) public override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty deposit");

        _govUserKeeper.depositTokens.exec(receiver, amount);
        _govUserKeeper.depositNfts.exec(receiver, nftIds);

        emit Deposited(amount, nftIds, receiver);
    }

    function setDependencies(address contractsRegistry) external override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        coreProperties = ICoreProperties(registry.getCorePropertiesContract());
        babt = ISBT721(registry.getBABTContract());
        dexeExpertNft = IERC721Expert(registry.getDexeExpertNftContract());
    }

    function createProposal(
        string calldata _descriptionURL,
        string calldata misc,
        ProposalAction[] calldata actionsOnFor,
        ProposalAction[] calldata actionsOnAgainst
    ) external override onlyBABTHolder {
        uint256 proposalId = ++latestProposalId;

        _proposals.createProposal(_descriptionURL, misc, actionsOnFor, actionsOnAgainst);

        _updateRewards(
            proposalId,
            RewardType.Create,
            _proposals[proposalId].core.settings.rewardsInfo.creationReward
        );
    }

    function moveProposalToValidators(uint256 proposalId) external override {
        _proposals.moveProposalToValidators(proposalId);

        _updateRewards(
            proposalId,
            RewardType.Create,
            _proposals[proposalId].core.settings.rewardsInfo.creationReward
        );
    }

    function vote(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external override onlyBABTHolder {
        _unlock(msg.sender, false);

        uint256 reward = _proposals.vote(
            _votedInProposals,
            _voteInfos,
            proposalId,
            msg.sender,
            voteAmount,
            voteNftIds,
            isVoteFor
        );

        _updateRewards(
            proposalId,
            isVoteFor ? RewardType.VoteFor : RewardType.VoteAgainst,
            reward
        );
    }

    function voteDelegated(uint256 proposalId, bool isVoteFor) external override onlyBABTHolder {
        _unlock(msg.sender, true);

        _voteDelegated(proposalId, msg.sender, isVoteFor);
    }

    function cancelVotes(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external onlyBABTHolder {
        _unlock(msg.sender, false);

        uint256 reward = _proposals.cancel(
            _voteInfos,
            proposalId,
            msg.sender,
            voteAmount,
            voteNftIds,
            isVoteFor
        );

        _pendingRewards.cancelRewards(
            _proposals,
            proposalId,
            isVoteFor ? RewardType.VoteFor : RewardType.VoteAgainst,
            reward
        );
    }

    function cancelVotesDelegated(uint256 proposalId, bool isVoteFor) external onlyBABTHolder {
        _unlock(msg.sender, true);

        _cancelVotesDelegated(proposalId, msg.sender, isVoteFor);
    }

    function withdraw(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty withdrawal");

        _unlock(msg.sender, false);

        _govUserKeeper.withdrawTokens.exec(receiver, amount);
        _govUserKeeper.withdrawNfts.exec(receiver, nftIds);

        emit Withdrawn(amount, nftIds, receiver);
    }

    function delegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty delegation");

        _unlock(msg.sender, false);

        _govUserKeeper.delegateTokens.exec(delegatee, amount);
        _govUserKeeper.delegateNfts.exec(delegatee, nftIds);

        _micropoolInfos[delegatee].saveDelegationInfo(delegatee);

        _revoteDelegated(delegatee);

        emit Delegated(msg.sender, delegatee, amount, nftIds, true);
    }

    function undelegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty undelegation");

        _govUserKeeper.undelegateTokens.exec(delegatee, amount);
        _govUserKeeper.undelegateNfts.exec(delegatee, nftIds);

        _micropoolInfos[delegatee].saveDelegationInfo(delegatee);

        _revoteDelegated(delegatee);

        emit Delegated(msg.sender, delegatee, amount, nftIds, false);
    }

    function claimRewards(uint256[] calldata proposalIds) external override onlyBABTHolder {
        for (uint256 i; i < proposalIds.length; i++) {
            _pendingRewards.claimReward(_proposals, proposalIds[i]);
        }
    }

    function claimStaking(
        uint256[] calldata proposalIds,
        address delegatee
    ) external override onlyBABTHolder {
        // _micropoolInfos[delegatee].claim(_proposals, proposalIds, delegatee);
    }

    function editDescriptionURL(string calldata newDescriptionURL) external override onlyThis {
        descriptionURL = newDescriptionURL;
    }

    function changeVerifier(address newVerifier) external override onlyThis {
        _offChain.verifier = newVerifier;
    }

    function changeBABTRestriction(bool onlyBABT) external override onlyThis {
        onlyBABTHolders = onlyBABT;
    }

    function setNftMultiplierAddress(address nftMultiplierAddress) external override onlyThis {
        _setNftMultiplierAddress(nftMultiplierAddress);
    }

    function saveOffchainResults(
        string calldata resultsHash,
        bytes calldata signature
    ) external override onlyBABTHolder {
        resultsHash.saveOffchainResults(signature, _offChain);

        _updateRewards(
            0,
            RewardType.SaveOffchainResults,
            _govSettings.getInternalSettings().rewardsInfo.executionReward
        );
    }

    receive() external payable {}

    function getProposalState(uint256 proposalId) public view override returns (ProposalState) {
        ProposalCore storage core = _proposals[proposalId].core;

        uint64 voteEnd = core.voteEnd;

        if (voteEnd == 0) {
            return ProposalState.Undefined;
        }

        if (core.executed) {
            return
                core._votesForMoreThanAgainst()
                    ? ProposalState.ExecutedFor
                    : ProposalState.ExecutedAgainst;
        }

        if (core.settings.earlyCompletion || voteEnd < block.timestamp) {
            if (core._quorumReached()) {
                if (
                    !core._votesForMoreThanAgainst() &&
                    _proposals[proposalId].actionsOnAgainst.length == 0
                ) {
                    return ProposalState.Defeated;
                }

                if (core.settings.validatorsVote) {
                    IGovValidators.ProposalState status = _govValidators.getProposalState(
                        proposalId,
                        false
                    );

                    if (status == IGovValidators.ProposalState.Undefined) {
                        if (_govValidators.validatorsCount() != 0) {
                            return ProposalState.WaitingForVotingTransfer;
                        }

                        return core._proposalStateBasedOnVoteResultsAndLock();
                    }

                    if (status == IGovValidators.ProposalState.Locked) {
                        return ProposalState.Locked;
                    }

                    if (status == IGovValidators.ProposalState.Succeeded) {
                        return core._proposalStateBasedOnVoteResults();
                    }

                    if (status == IGovValidators.ProposalState.Defeated) {
                        return ProposalState.Defeated;
                    }

                    return ProposalState.ValidatorVoting;
                }

                return core._proposalStateBasedOnVoteResultsAndLock();
            }

            if (voteEnd < block.timestamp) {
                return ProposalState.Defeated;
            }
        }

        return ProposalState.Voting;
    }

    function getHelperContracts()
        external
        view
        override
        returns (
            address settings,
            address userKeeper,
            address validators,
            address distributionProposal
        )
    {
        return (
            address(_govSettings),
            address(_govUserKeeper),
            address(_govValidators),
            _distributionProposal
        );
    }

    function getProposals(
        uint256 offset,
        uint256 limit
    ) external view override returns (ProposalView[] memory proposals) {
        return _proposals.getProposals(offset, limit);
    }

    function getProposalRequiredQuorum(
        uint256 proposalId
    ) external view override returns (uint256) {
        ProposalCore storage core = _proposals[proposalId].core;

        if (core.voteEnd == 0) {
            return 0;
        }

        return _govUserKeeper.getTotalVoteWeight().ratio(core.settings.quorum, PERCENTAGE_100);
    }

    function getTotalVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view override returns (uint256, uint256, uint256, uint256) {
        IGovPool.ProposalCore storage core = _proposals[proposalId].core;
        IGovPool.VoteInfo storage info = _voteInfos[proposalId][voter][isMicropool];

        return (
            core.votesFor,
            core.votesAgainst,
            info.voteFor.totalVoted,
            info.voteAgainst.totalVoted
        );
    }

    function getUserVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view override returns (VoteInfoView memory voteInfo) {
        VoteInfo storage info = _voteInfos[proposalId][voter][isMicropool];

        return
            VoteInfoView({
                totalVotedFor: info.voteFor.totalVoted,
                totalVotedAgainst: info.voteAgainst.totalVoted,
                tokensVotedFor: info.voteFor.tokensVoted,
                tokensVotedAgainst: info.voteAgainst.tokensVoted,
                nftsVotedFor: info.voteFor.nftsVoted.values(),
                nftsVotedAgainst: info.voteAgainst.nftsVoted.values()
            });
    }

    function getWithdrawableAssets(
        address delegator
    ) external view override returns (uint256 tokens, uint256[] memory nfts) {
        return delegator.getWithdrawableAssets(_votedInProposals, _voteInfos);
    }

    function getPendingRewards(
        address user,
        uint256[] calldata proposalIds
    ) external view override returns (PendingRewardsView memory) {
        return _pendingRewards.getPendingRewards(_proposals, user, proposalIds);
    }

    function getDelegatorStakingRewards(
        uint256[] calldata proposalIds,
        address delegator,
        address delegatee
    ) external view override returns (DelegatorStakingRewards memory delegatorStakingRewards) {
        //        return
        //            _micropoolInfos[delegatee].getDelegatorStakingRewards(
        //                _proposals,
        //                proposalIds,
        //                delegator,
        //                delegatee
        //            );
    }

    function getOffchainResultsHash() external view override returns (string memory resultsHash) {
        return _offChain.resultsHash;
    }

    function getOffchainSignHash(
        string calldata resultHash
    ) external view override returns (bytes32) {
        return resultHash.getSignHash();
    }

    function getVerifier() external view override returns (address) {
        return _offChain.verifier;
    }

    function _setNftMultiplierAddress(address nftMultiplierAddress) internal {
        require(nftMultiplier == address(0), "Gov: current nft address isn't zero");
        require(nftMultiplierAddress != address(0), "Gov: new nft address is zero");

        nftMultiplier = nftMultiplierAddress;
    }

    function _updateRewards(uint256 proposalId, RewardType rewardType, uint256 amount) internal {
        _pendingRewards.updateRewards(_proposals, proposalId, rewardType, amount);
    }

    function _unlock(address user, bool isMicropool) internal {
        _unlockInProposals(_votedInProposals[user][false].values(), user, isMicropool);
    }

    function _unlockInProposals(
        uint256[] memory proposalIds,
        address user,
        bool isMicropool
    ) internal {
        _votedInProposals.unlockInProposals(_voteInfos, proposalIds, user, isMicropool);
    }

    function _voteDelegated(uint256 proposalId, address delegatee, bool isVoteFor) internal {
        uint256 reward = _proposals.voteDelegated(
            _votedInProposals,
            _voteInfos,
            proposalId,
            delegatee,
            isVoteFor
        );

        uint256 micropoolReward = reward.percentage(PERCENTAGE_MICROPOOL_REWARDS);

        _updateRewards(
            proposalId,
            isVoteFor ? RewardType.VoteForDelegated : RewardType.VoteAgainstDelegated,
            micropoolReward
        );

        _micropoolInfos[delegatee][isVoteFor].updateRewards(proposalId, reward - micropoolReward);
    }

    function _cancelVotesDelegated(
        uint256 proposalId,
        address delegatee,
        bool isVoteFor
    ) internal {
        uint256 reward = _proposals.cancelDelegated(_voteInfos, proposalId, delegatee, isVoteFor);

        uint256 micropoolReward = reward.percentage(PERCENTAGE_MICROPOOL_REWARDS);

        _pendingRewards.cancelRewards(
            _proposals,
            proposalId,
            isVoteFor ? RewardType.VoteForDelegated : RewardType.VoteAgainstDelegated,
            micropoolReward
        );

        _micropoolInfos[delegatee][isVoteFor].updateRewards(proposalId, 0);
    }

    function _revoteDelegated(address delegatee) internal {
        _unlock(delegatee, true);

        uint256[] memory proposalIds = _votedInProposals[delegatee][true].values();

        for (uint256 i; i < proposalIds.length; i++) {
            uint256 proposalId = proposalIds[i];

            (bool isVoteFor, ) = _voteInfos._getIsVoteFor(delegatee, proposalId, true);

            _cancelVotesDelegated(proposalId, delegatee, isVoteFor);
            _voteDelegated(proposalId, delegatee, isVoteFor);
        }
    }

    function _onlyThis() internal view {
        require(address(this) == msg.sender, "Gov: not this contract");
    }

    function _onlyBABTHolder() internal view {
        require(!onlyBABTHolders || babt.balanceOf(msg.sender) > 0, "Gov: not BABT holder");
    }
}
