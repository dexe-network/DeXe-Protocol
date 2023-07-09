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
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/core/ICoreProperties.sol";
import "../interfaces/core/ISBT721.sol";

import "../libs/gov-user-keeper/GovUserKeeperLocal.sol";
import "../libs/gov-pool/GovPoolView.sol";
import "../libs/gov-pool/GovPoolCreate.sol";
import "../libs/gov-pool/GovPoolRewards.sol";
import "../libs/gov-pool/GovPoolVote.sol";
import "../libs/gov-pool/GovPoolUnlock.sol";
import "../libs/gov-pool/GovPoolExecute.sol";
import "../libs/gov-pool/GovPoolStaking.sol";
import "../libs/gov-pool/GovPoolOffchain.sol";
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
    using GovPoolStaking for *;

    uint256 public constant override PERCENTAGE_MICROPOOL_REWARDS = PERCENTAGE_100 / 5; // 20%

    string public override descriptionURL;
    string public override name;

    uint256 public override latestProposalId;
    uint256 public override deployerBABTid;

    ICoreProperties public override coreProperties;

    address public override nftMultiplier;
    ISBT721 public override babt;

    bool public override onlyBABTHolders;

    IGovSettings internal _govSettings;
    IGovUserKeeper internal _govUserKeeper;
    IGovValidators internal _govValidators;
    address internal _distributionProposal;

    OffChain internal _offChain;

    mapping(uint256 => Proposal) internal _proposals; // proposalId => info

    mapping(uint256 => mapping(address => mapping(bool => VoteInfo))) internal _voteInfos; // proposalId => voter => isMicropool => info
    mapping(address => mapping(bool => EnumerableSet.UintSet)) internal _votedInProposals; // voter => isMicropool => active proposal ids

    mapping(address => PendingRewards) internal _pendingRewards; // user => pending rewards

    mapping(address => MicropoolInfo) internal _micropoolInfos;

    modifier onlyThis() {
        _onlyThis();
        _;
    }

    modifier onlyBABTHolder() {
        _onlyBABTHolder();
        _;
    }

    function __GovPool_init(
        address govSettingAddress,
        address govUserKeeperAddress,
        address distributionProposalAddress,
        address validatorsAddress,
        address nftMultiplierAddress,
        address _verifier,
        bool _onlyBABTHolders,
        uint256 _deployerBABTid,
        string calldata _descriptionURL,
        string calldata _name
    ) external override initializer {
        _govSettings = IGovSettings(govSettingAddress);
        _govUserKeeper = IGovUserKeeper(govUserKeeperAddress);
        _govValidators = IGovValidators(validatorsAddress);
        _distributionProposal = distributionProposalAddress;

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

        IGovUserKeeper govUserKeeper = _govUserKeeper;

        govUserKeeper.depositTokens.exec(receiver, amount);
        govUserKeeper.depositNfts.exec(receiver, nftIds);

        emit Deposited(amount, nftIds, receiver);
    }

    function setDependencies(address contractsRegistry) external override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        coreProperties = ICoreProperties(registry.getCorePropertiesContract());
        babt = ISBT721(registry.getBABTContract());
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

    function voteDelegated(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isVoteFor
    ) external override onlyBABTHolder {
        _unlock(msg.sender, true);

        uint256 reward = _proposals.voteDelegated(
            _votedInProposals,
            _voteInfos,
            proposalId,
            voteAmount,
            voteNftIds,
            isVoteFor
        );

        uint256 micropoolReward = reward.percentage(PERCENTAGE_MICROPOOL_REWARDS);

        _updateRewards(
            proposalId,
            isVoteFor ? RewardType.VoteForDelegated : RewardType.VoteAgainstDelegated,
            micropoolReward
        );

        _micropoolInfos[msg.sender].updateRewards(
            _proposals,
            proposalId,
            isVoteFor ? RewardType.VoteForDelegated : RewardType.VoteAgainstDelegated,
            reward - micropoolReward
        );
    }

    function withdraw(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty withdrawal");

        _unlock(msg.sender, false);

        IGovUserKeeper govUserKeeper = _govUserKeeper;

        govUserKeeper.withdrawTokens.exec(receiver, amount);
        govUserKeeper.withdrawNfts.exec(receiver, nftIds);

        emit Withdrawn(amount, nftIds, receiver);
    }

    function delegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty delegation");

        _unlock(msg.sender, false);

        MicropoolInfo storage micropool = _micropoolInfos[delegatee];

        micropool.stake(delegatee);

        _govUserKeeper.delegateTokens.exec(delegatee, amount);
        _govUserKeeper.delegateNfts.exec(delegatee, nftIds);

        micropool.updateStakingCache(delegatee);

        emit Delegated(msg.sender, delegatee, amount, nftIds, true);
    }

    function undelegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override onlyBABTHolder {
        require(amount > 0 || nftIds.length > 0, "Gov: empty undelegation");

        _unlock(delegatee, true);

        MicropoolInfo storage micropool = _micropoolInfos[delegatee];

        micropool.unstake(delegatee);

        _govUserKeeper.undelegateTokens.exec(delegatee, amount);
        _govUserKeeper.undelegateNfts.exec(delegatee, nftIds);

        micropool.updateStakingCache(delegatee);

        emit Delegated(msg.sender, delegatee, amount, nftIds, false);
    }

    function claimRewards(uint256[] calldata proposalIds) external override onlyBABTHolder {
        for (uint256 i; i < proposalIds.length; i++) {
            _pendingRewards.claimReward(_proposals, proposalIds[i]);
        }
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
                core.votesForMoreThanAgainst()
                    ? ProposalState.ExecutedFor
                    : ProposalState.ExecutedAgainst;
        }

        if (core.settings.earlyCompletion || voteEnd < block.timestamp) {
            if (core.quorumReached()) {
                if (
                    !core.votesForMoreThanAgainst() &&
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

                        return core.proposalStateBasedOnVoteResultsAndLock();
                    }

                    if (status == IGovValidators.ProposalState.Locked) {
                        return ProposalState.Locked;
                    }

                    if (status == IGovValidators.ProposalState.Succeeded) {
                        return core.proposalStateBasedOnVoteResults();
                    }

                    if (status == IGovValidators.ProposalState.Defeated) {
                        return ProposalState.Defeated;
                    }

                    return ProposalState.ValidatorVoting;
                }

                return core.proposalStateBasedOnVoteResultsAndLock();
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

        return (core.votesFor, core.votesAgainst, info.totalVotedFor, info.totalVotedAgainst);
    }

    function getUserVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view override returns (VoteInfoView memory voteInfo) {
        VoteInfo storage info = _voteInfos[proposalId][voter][isMicropool];

        return
            VoteInfoView({
                totalVotedFor: info.totalVotedFor,
                totalVotedAgainst: info.totalVotedAgainst,
                tokensVotedFor: info.tokensVotedFor,
                tokensVotedAgainst: info.tokensVotedAgainst,
                nftsVotedFor: info.nftsVotedFor.values(),
                nftsVotedAgainst: info.nftsVotedAgainst.values()
            });
    }

    function getWithdrawableAssets(
        address delegator,
        address delegatee
    ) external view override returns (uint256 tokens, uint256[] memory nfts) {
        return
            delegatee == address(0)
                ? delegator.getWithdrawableAssets(_votedInProposals, _voteInfos)
                : delegator.getUndelegateableAssets(delegatee, _votedInProposals, _voteInfos);
    }

    function getPendingRewards(
        address user,
        uint256[] calldata proposalIds
    ) external view override returns (PendingRewardsView memory) {
        return _pendingRewards.getPendingRewards(_proposals, user, proposalIds);
    }

    function getDelegatorStakingRewards(
        address delegator
    ) external view override returns (UserStakeRewardsView[] memory) {
        return _micropoolInfos.getDelegatorStakingRewards(delegator);
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
        _unlockInProposals(_votedInProposals[user][isMicropool].values(), user, isMicropool);
    }

    function _unlockInProposals(
        uint256[] memory proposalIds,
        address user,
        bool isMicropool
    ) internal {
        _votedInProposals.unlockInProposals(_voteInfos, proposalIds, user, isMicropool);
    }

    function _onlyThis() internal view {
        require(address(this) == msg.sender, "Gov: not this contract");
    }

    function _onlyBABTHolder() internal view {
        require(!onlyBABTHolders || babt.balanceOf(msg.sender) > 0, "Gov: not BABT holder");
    }
}
