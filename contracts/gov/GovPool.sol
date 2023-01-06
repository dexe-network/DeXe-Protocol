// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

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

import "../libs/gov-user-keeper/GovUserKeeperLocal.sol";
import "../libs/gov-pool/GovPoolView.sol";
import "../libs/gov-pool/GovPoolCreate.sol";
import "../libs/gov-pool/GovPoolRewards.sol";
import "../libs/gov-pool/GovPoolVote.sol";
import "../libs/gov-pool/GovPoolUnlock.sol";
import "../libs/gov-pool/GovPoolExecute.sol";
import "../libs/gov-pool/GovPoolStaking.sol";
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
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using ShrinkableArray for uint256[];
    using ShrinkableArray for ShrinkableArray.UintArray;
    using GovUserKeeperLocal for *;
    using GovPoolView for *;
    using GovPoolCreate for *;
    using GovPoolRewards for *;
    using GovPoolVote for *;
    using GovPoolUnlock for *;
    using GovPoolExecute for *;
    using GovPoolStaking for *;

    uint256 public constant PERCENTAGE_DELEGATORS_REWARDS = (4 * PERCENTAGE_100) / 5; // 80%
    uint256 public constant PERCENTAGE_MICROPOOL_REWARDS = PERCENTAGE_100 / 5; // 20%

    IGovSettings internal _govSettings;
    IGovUserKeeper internal _govUserKeeper;
    IGovValidators internal _govValidators;
    address internal _distributionProposal;

    ICoreProperties public coreProperties;

    address public nftMultiplier;

    string public descriptionURL;
    string public name;

    uint256 public override latestProposalId;

    mapping(uint256 => Proposal) internal _proposals; // proposalId => info

    mapping(uint256 => mapping(address => mapping(bool => VoteInfo))) internal _voteInfos; // proposalId => voter => isMicropool => info
    mapping(address => mapping(bool => EnumerableSet.UintSet)) internal _votedInProposals; // voter => isMicropool => active proposal ids

    mapping(uint256 => mapping(address => uint256)) public pendingRewards; // proposalId => user => tokens amount

    mapping(address => MicropoolInfo) internal _micropoolInfos;

    event Delegated(address from, address to, uint256 amount, uint256[] nfts, bool isDelegate);
    event MovedToValidators(uint256 proposalId, address sender);
    event Deposited(uint256 amount, uint256[] nfts, address sender);
    event Withdrawn(uint256 amount, uint256[] nfts, address sender);

    modifier onlyThis() {
        _onlyThis();
        _;
    }

    function __GovPool_init(
        address govSettingAddress,
        address govUserKeeperAddress,
        address distributionProposalAddress,
        address validatorsAddress,
        address nftMultiplierAddress,
        string calldata _descriptionURL,
        string calldata _name
    ) external initializer {
        _govSettings = IGovSettings(govSettingAddress);
        _govUserKeeper = IGovUserKeeper(govUserKeeperAddress);
        _govValidators = IGovValidators(validatorsAddress);
        _distributionProposal = distributionProposalAddress;

        if (nftMultiplierAddress != address(0)) {
            _setNftMultiplierAddress(nftMultiplierAddress);
        }

        descriptionURL = _descriptionURL;
        name = _name;
    }

    function setDependencies(address contractsRegistry) external override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        coreProperties = ICoreProperties(registry.getCorePropertiesContract());
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

    function createProposal(
        string calldata _descriptionURL,
        string calldata misc,
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) external override {
        latestProposalId++;

        _proposals.createProposal(_descriptionURL, misc, executors, values, data);

        pendingRewards.updateRewards(
            latestProposalId,
            _proposals[latestProposalId].core.settings.creationReward,
            PRECISION
        );
    }

    function moveProposalToValidators(uint256 proposalId) external override {
        _proposals.moveProposalToValidators(proposalId);

        pendingRewards.updateRewards(
            proposalId,
            _proposals[proposalId].core.settings.creationReward,
            PRECISION
        );

        emit MovedToValidators(proposalId, msg.sender);
    }

    function vote(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external override {
        unlock(msg.sender, false);

        uint256 reward = _proposals.vote(
            _votedInProposals,
            _voteInfos,
            proposalId,
            voteAmount,
            voteNftIds
        );

        pendingRewards.updateRewards(
            proposalId,
            reward,
            _proposals[proposalId].core.settings.voteRewardsCoefficient
        );
    }

    function voteDelegated(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external override {
        unlock(msg.sender, true);

        uint256 reward = _proposals.voteDelegated(
            _votedInProposals,
            _voteInfos,
            proposalId,
            voteAmount,
            voteNftIds
        );

        pendingRewards.updateRewards(
            proposalId,
            reward.percentage(PERCENTAGE_MICROPOOL_REWARDS),
            _proposals[proposalId].core.settings.voteRewardsCoefficient
        );

        _micropoolInfos[msg.sender].updateRewards(
            reward.percentage(PERCENTAGE_DELEGATORS_REWARDS),
            _proposals[proposalId].core.settings.voteRewardsCoefficient,
            _proposals[proposalId].core.settings.rewardToken
        );
    }

    function deposit(address receiver, uint256 amount, uint256[] calldata nftIds) public override {
        require(amount > 0 || nftIds.length > 0, "Gov: empty deposit");

        _govUserKeeper.depositTokens.exec(receiver, amount);
        _govUserKeeper.depositNfts.exec(receiver, nftIds);

        emit Deposited(amount, nftIds, receiver);
    }

    function withdraw(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "Gov: empty withdrawal");

        unlock(msg.sender, false);

        _govUserKeeper.withdrawTokens.exec(receiver, amount);
        _govUserKeeper.withdrawNfts.exec(receiver, nftIds);

        emit Withdrawn(amount, nftIds, receiver);
    }

    function delegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "Gov: empty delegation");

        unlock(msg.sender, false);

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
    ) external override {
        require(amount > 0 || nftIds.length > 0, "Gov: empty undelegation");

        unlock(delegatee, true);

        MicropoolInfo storage micropool = _micropoolInfos[delegatee];

        micropool.unstake(delegatee);

        _govUserKeeper.undelegateTokens.exec(delegatee, amount);
        _govUserKeeper.undelegateNfts.exec(delegatee, nftIds);

        micropool.updateStakingCache(delegatee);

        emit Delegated(msg.sender, delegatee, amount, nftIds, false);
    }

    function unlock(address user, bool isMicropool) public override {
        unlockInProposals(_votedInProposals[user][isMicropool].values(), user, isMicropool);
    }

    function unlockInProposals(
        uint256[] memory proposalIds,
        address user,
        bool isMicropool
    ) public override {
        _votedInProposals.unlockInProposals(_voteInfos, proposalIds, user, isMicropool);
    }

    function execute(uint256 proposalId) public override {
        _proposals.execute(proposalId);

        pendingRewards.updateRewards(
            proposalId,
            _proposals[proposalId].core.settings.executionReward,
            PRECISION
        );
    }

    function claimRewards(uint256[] calldata proposalIds) external override {
        for (uint256 i; i < proposalIds.length; i++) {
            pendingRewards.claimReward(_proposals, proposalIds[i]);
        }
    }

    function editDescriptionURL(string calldata newDescriptionURL) external override onlyThis {
        descriptionURL = newDescriptionURL;
    }

    function setNftMultiplierAddress(address nftMultiplierAddress) external override onlyThis {
        _setNftMultiplierAddress(nftMultiplierAddress);
    }

    receive() external payable {}

    function getProposals(
        uint256 offset,
        uint256 limit
    ) external view returns (ProposalView[] memory proposals) {
        return _proposals.getProposals(offset, limit);
    }

    function getProposalState(uint256 proposalId) public view override returns (ProposalState) {
        ProposalCore storage core = _proposals[proposalId].core;

        uint64 voteEnd = core.voteEnd;

        if (voteEnd == 0) {
            return ProposalState.Undefined;
        }

        if (core.executed) {
            return ProposalState.Executed;
        }

        if (core.settings.earlyCompletion || voteEnd < block.timestamp) {
            if (_quorumReached(core)) {
                if (core.settings.validatorsVote && _govValidators.validatorsCount() > 0) {
                    IGovValidators.ProposalState status = _govValidators.getProposalState(
                        proposalId,
                        false
                    );

                    if (status == IGovValidators.ProposalState.Undefined) {
                        return ProposalState.WaitingForVotingTransfer;
                    }

                    if (status == IGovValidators.ProposalState.Succeeded) {
                        return ProposalState.Succeeded;
                    }

                    if (status == IGovValidators.ProposalState.Defeated) {
                        return ProposalState.Defeated;
                    }

                    return ProposalState.ValidatorVoting;
                } else {
                    return ProposalState.Succeeded;
                }
            }

            if (voteEnd < block.timestamp) {
                return ProposalState.Defeated;
            }
        }

        return ProposalState.Voting;
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
    ) external view override returns (uint256, uint256) {
        return (
            _proposals[proposalId].core.votesFor,
            _voteInfos[proposalId][voter][isMicropool].totalVoted
        );
    }

    function getUserVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view returns (VoteInfoView memory voteInfo) {
        VoteInfo storage info = _voteInfos[proposalId][voter][isMicropool];

        return
            VoteInfoView({
                totalVoted: info.totalVoted,
                tokensVoted: info.tokensVoted,
                nftsVoted: info.nftsVoted.values()
            });
    }

    function getWithdrawableAssets(
        address delegator,
        address delegatee
    ) external view override returns (uint256 tokens, ShrinkableArray.UintArray memory nfts) {
        return
            delegatee == address(0)
                ? delegator.getWithdrawableAssets(_votedInProposals, _voteInfos)
                : delegator.getUndelegateableAssets(delegatee, _votedInProposals, _voteInfos);
    }

    function getDelegatorStakingRewards(
        address delegator
    ) external view override returns (UserStakeRewardsView[] memory) {
        return _micropoolInfos.getDelegatorStakingRewards(delegator);
    }

    function _setNftMultiplierAddress(address nftMultiplierAddress) internal {
        require(nftMultiplier == address(0), "Gov: current nft address isn't zero");
        require(nftMultiplierAddress != address(0), "Gov: new nft address is zero");

        nftMultiplier = nftMultiplierAddress;
    }

    function _quorumReached(ProposalCore storage core) internal view returns (bool) {
        return
            PERCENTAGE_100.ratio(core.votesFor, _govUserKeeper.getTotalVoteWeight()) >=
            core.settings.quorum;
    }

    function _onlyThis() internal view {
        require(address(this) == msg.sender, "Gov: not this contract");
    }
}
