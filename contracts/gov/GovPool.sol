// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";

import "@dlsl/dev-modules/libs/arrays/ArrayHelper.sol";
import "@dlsl/dev-modules/contracts-registry/AbstractDependant.sol";

import "../interfaces/gov/settings/IGovSettings.sol";
import "../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../interfaces/gov/validators/IGovValidators.sol";
import "../interfaces/gov/IGovPool.sol";
import "../interfaces/gov/validators/IGovValidators.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/core/ICoreProperties.sol";

import "../libs/gov-user-keeper/GovUserKeeperLocal.sol";
import "../libs/math/MathHelper.sol";
import "../libs/utils/DataHelper.sol";
import "../libs/utils/TokenBalance.sol";

import "../core/Globals.sol";

contract GovPool is
    IGovPool,
    AbstractDependant,
    ERC721HolderUpgradeable,
    ERC1155HolderUpgradeable
{
    using Math for uint256;
    using Math for uint64;
    using MathHelper for uint256;
    using EnumerableSet for EnumerableSet.UintSet;
    using ShrinkableArray for uint256[];
    using ShrinkableArray for ShrinkableArray.UintArray;
    using ArrayHelper for uint256[];
    using DataHelper for bytes;
    using SafeERC20 for IERC20;
    using TokenBalance for address;
    using DecimalsConverter for uint256;
    using GovUserKeeperLocal for *;

    IGovSettings internal _govSettings;
    IGovUserKeeper internal _govUserKeeper;
    IGovValidators internal _govValidators;
    address internal _distributionProposal;

    ICoreProperties internal _coreProperties;

    string public descriptionURL;

    uint256 internal _latestProposalId;

    mapping(uint256 => Proposal) public proposals; // proposalId => info

    mapping(uint256 => mapping(address => mapping(bool => VoteInfo))) internal _voteInfos; // proposalId => voter => isMicropool => info
    mapping(address => mapping(bool => EnumerableSet.UintSet)) internal _votedInProposals; // voter => isMicropool => active proposal ids

    mapping(uint256 => mapping(address => uint256)) public pendingRewards; // proposalId => user => tokens amount

    event ProposalCreated(
        uint256 proposalId,
        address sender,
        uint256 quorum,
        address mainExecutor
    );
    event Delegated(address from, address to, uint256 amount, uint256[] nfts, bool isDelegate);
    event Voted(uint256 proposalId, address sender, uint256 personalVote, uint256 delegatedVote);
    event DPCreated(uint256 proposalId, address sender, address token, uint256 amount);
    event ProposalExecuted(uint256 proposalId, address sender);
    event RewardClaimed(uint256 proposalId, address sender, address token, uint256 amount);

    modifier onlyThis() {
        require(address(this) == msg.sender, "Gov: not this contract");
        _;
    }

    function __GovPool_init(
        address govSettingAddress,
        address govUserKeeperAddress,
        address distributionProposalAddress,
        address validatorsAddress,
        string calldata _descriptionURL
    ) external initializer {
        _govSettings = IGovSettings(govSettingAddress);
        _govUserKeeper = IGovUserKeeper(govUserKeeperAddress);
        _govValidators = IGovValidators(validatorsAddress);
        _distributionProposal = distributionProposalAddress;

        descriptionURL = _descriptionURL;
    }

    function setDependencies(address contractsRegistry) public virtual override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _coreProperties = ICoreProperties(registry.getCorePropertiesContract());
    }

    function getHelperContracts() external view override returns (address[4] memory) {
        return [
            address(_govSettings),
            address(_govUserKeeper),
            address(_govValidators),
            _distributionProposal
        ];
    }

    function createProposal(
        string calldata _descriptionURL,
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) external override {
        require(
            executors.length > 0 &&
                executors.length == values.length &&
                executors.length == data.length,
            "Gov: invalid array length"
        );

        uint256 proposalId = ++_latestProposalId;

        address mainExecutor = executors[executors.length - 1];
        uint256 executorSettings = _govSettings.executorToSettings(mainExecutor);

        bool forceDefaultSettings;
        IGovSettings.ProposalSettings memory settings;

        if (executorSettings == uint256(IGovSettings.ExecutorType.INTERNAL)) {
            _handleExecutorsAndDataForInternalProposal(executors, values, data);
        } else if (executorSettings == uint256(IGovSettings.ExecutorType.VALIDATORS)) {
            _handleDataForValidatorBalanceProposal(executors, values, data);
        } else if (executorSettings == uint256(IGovSettings.ExecutorType.DISTRIBUTION)) {
            _handleDataForDistributionProposal(values, data);
        } else if (executorSettings != uint256(IGovSettings.ExecutorType.DEFAULT)) {
            forceDefaultSettings = _handleDataForExistingSettingsProposal(values, data);
        }

        if (forceDefaultSettings) {
            settings = _govSettings.getDefaultSettings();
        } else {
            settings = _govSettings.getSettings(mainExecutor);
        }

        proposals[proposalId] = Proposal({
            core: ProposalCore({
                settings: settings,
                executed: false,
                voteEnd: uint64(block.timestamp + settings.duration),
                votesFor: 0,
                nftPowerSnapshotId: _govUserKeeper.createNftPowerSnapshot(),
                proposalId: proposalId
            }),
            descriptionURL: _descriptionURL,
            executors: executors,
            values: values,
            data: data
        });

        require(
            _canParticipate(proposals[proposalId].core, false, !settings.delegatedVotingAllowed),
            "Gov: low voting power"
        );

        _updateRewards(proposalId, settings.creationReward, PRECISION);

        emit ProposalCreated(proposalId, msg.sender, settings.quorum, mainExecutor);
    }

    function vote(
        uint256 proposalId,
        uint256 depositAmount,
        uint256[] calldata depositNftIds,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external override {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty vote");

        _govUserKeeper.depositTokens.exec(msg.sender, depositAmount);
        _govUserKeeper.depositNfts.exec(msg.sender, depositNftIds);

        bool useDelegated = !proposals[proposalId].core.settings.delegatedVotingAllowed;
        ProposalCore storage core = _beforeVote(proposalId, false, useDelegated);

        _vote(core, proposalId, voteAmount, voteNftIds, false, useDelegated);
    }

    function voteDelegated(
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external override {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty delegated vote");
        require(
            proposals[proposalId].core.settings.delegatedVotingAllowed,
            "Gov: delegated voting off"
        );

        ProposalCore storage core = _beforeVote(proposalId, true, false);

        _vote(core, proposalId, voteAmount, voteNftIds, true, false);
    }

    function deposit(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) public override {
        require(amount > 0 || nftIds.length > 0, "Gov: empty deposit");

        _govUserKeeper.depositTokens.exec(receiver, amount);
        _govUserKeeper.depositNfts.exec(receiver, nftIds);
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
    }

    function delegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "Gov: empty delegation");

        unlock(msg.sender, false);

        _govUserKeeper.delegateTokens.exec(delegatee, amount);
        _govUserKeeper.delegateNfts.exec(delegatee, nftIds);

        _emitDelegated(delegatee, amount, nftIds, true);
    }

    function undelegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "Gov: empty undelegation");

        unlock(delegatee, true);

        _govUserKeeper.undelegateTokens.exec(delegatee, amount);
        _govUserKeeper.undelegateNfts.exec(delegatee, nftIds);

        _emitDelegated(delegatee, amount, nftIds, false);
    }

    function unlock(address user, bool isMicropool) public override {
        unlockInProposals(_votedInProposals[user][isMicropool].values(), user, isMicropool);
    }

    function unlockInProposals(
        uint256[] memory proposalIds,
        address user,
        bool isMicropool
    ) public override {
        IGovUserKeeper userKeeper = _govUserKeeper;

        uint256 maxLockedAmount = userKeeper.maxLockedAmount(user, isMicropool);
        uint256 maxUnlocked;

        for (uint256 i; i < proposalIds.length; i++) {
            require(
                _votedInProposals[user][isMicropool].contains(proposalIds[i]),
                "Gov: no vote for this proposal"
            );

            ProposalState state = _getProposalState(proposals[proposalIds[i]].core);

            if (
                state != ProposalState.Executed &&
                state != ProposalState.Succeeded &&
                state != ProposalState.Defeated
            ) {
                continue;
            }

            maxUnlocked = userKeeper.unlockTokens(proposalIds[i], user, isMicropool).max(
                maxUnlocked
            );
            userKeeper.unlockNfts(
                _voteInfos[proposalIds[i]][user][isMicropool].nftsVoted.values()
            );

            _votedInProposals[user][isMicropool].remove(proposalIds[i]);
        }

        if (maxLockedAmount <= maxUnlocked) {
            userKeeper.updateMaxTokenLockedAmount(
                _votedInProposals[user][isMicropool].values(),
                user,
                isMicropool
            );
        }
    }

    function execute(uint256 proposalId) public override {
        _execute(proposalId);
        _payCommission(proposalId);

        emit ProposalExecuted(proposalId, msg.sender);
    }

    function moveProposalToValidators(uint256 proposalId) external override {
        ProposalCore storage core = proposals[proposalId].core;
        ProposalState state = _getProposalState(core);

        require(state == ProposalState.WaitingForVotingTransfer, "Gov: can't be moved");

        _govValidators.createExternalProposal(
            proposalId,
            core.settings.durationValidators,
            core.settings.quorumValidators
        );
    }

    function claimRewards(uint256[] calldata proposalIds) external override {
        for (uint256 i; i < proposalIds.length; i++) {
            _claimReward(proposalIds[i]);
        }
    }

    function executeAndClaim(uint256 proposalId) external override {
        execute(proposalId);
        _claimReward(proposalId);
    }

    function editDescriptionURL(string calldata newDescriptionURL) external override onlyThis {
        descriptionURL = newDescriptionURL;
    }

    receive() external payable {}

    function getProposalInfo(uint256 proposalId)
        external
        view
        override
        returns (address[] memory, bytes[] memory)
    {
        return (proposals[proposalId].executors, proposals[proposalId].data);
    }

    function getProposalState(uint256 proposalId) external view override returns (ProposalState) {
        return _getProposalState(proposals[proposalId].core);
    }

    function getTotalVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view override returns (uint256, uint256) {
        return (
            proposals[proposalId].core.votesFor,
            _voteInfos[proposalId][voter][isMicropool].totalVoted
        );
    }

    function getWithdrawableAssets(address user)
        external
        view
        override
        returns (uint256 withdrawableTokens, ShrinkableArray.UintArray memory withdrawableNfts)
    {
        (
            ShrinkableArray.UintArray memory unlockedIds,
            ShrinkableArray.UintArray memory lockedIds
        ) = getUserProposals(user, false);

        uint256[] memory unlockedNfts = getUnlockedNfts(unlockedIds, user, false);

        return _govUserKeeper.getWithdrawableAssets(user, lockedIds, unlockedNfts);
    }

    function getUndelegateableAssets(address delegator, address delegatee)
        external
        view
        override
        returns (uint256 undelegateableTokens, ShrinkableArray.UintArray memory undelegateableNfts)
    {
        (
            ShrinkableArray.UintArray memory unlockedIds,
            ShrinkableArray.UintArray memory lockedIds
        ) = getUserProposals(delegatee, true);

        uint256[] memory unlockedNfts = getUnlockedNfts(unlockedIds, delegatee, true);

        return
            _govUserKeeper.getUndelegateableAssets(delegator, delegatee, lockedIds, unlockedNfts);
    }

    function getUserProposals(address user, bool isMicropool)
        public
        view
        override
        returns (
            ShrinkableArray.UintArray memory unlockedIds,
            ShrinkableArray.UintArray memory lockedIds
        )
    {
        uint256 proposalsLength = _votedInProposals[user][isMicropool].length();

        uint256[] memory unlockedProposals = new uint256[](proposalsLength);
        uint256[] memory lockedProposals = new uint256[](proposalsLength);
        uint256 unlockedLength;
        uint256 lockedLength;

        for (uint256 i; i < proposalsLength; i++) {
            uint256 proposalId = _votedInProposals[user][isMicropool].at(i);

            ProposalState state = _getProposalState(proposals[proposalId].core);

            if (
                state == ProposalState.Executed ||
                state == ProposalState.Succeeded ||
                state == ProposalState.Defeated
            ) {
                unlockedProposals[unlockedLength++] = proposalId;
            } else {
                lockedProposals[lockedLength++] = proposalId;
            }
        }

        unlockedIds = unlockedProposals.transform().crop(unlockedLength);
        lockedIds = lockedProposals.transform().crop(lockedLength);
    }

    function getUnlockedNfts(
        ShrinkableArray.UintArray memory unlockedIds,
        address user,
        bool isMicropool
    ) public view override returns (uint256[] memory unlockedNfts) {
        uint256 totalLength;

        for (uint256 i; i < unlockedIds.length; i++) {
            totalLength += _voteInfos[unlockedIds.values[i]][user][isMicropool].nftsVoted.length();
        }

        unlockedNfts = new uint256[](totalLength);
        totalLength = 0;

        for (uint256 i; i < unlockedIds.length; i++) {
            VoteInfo storage voteInfo = _voteInfos[unlockedIds.values[i]][user][isMicropool];

            totalLength = unlockedNfts.insert(totalLength, voteInfo.nftsVoted.values());
        }
    }

    function _execute(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];
        ProposalCore storage core = proposal.core;

        require(_getProposalState(core) == ProposalState.Succeeded, "Gov: invalid status");

        core.executed = true;

        address[] memory executors = proposal.executors;
        uint256[] memory values = proposal.values;
        bytes[] memory data = proposal.data;

        for (uint256 i; i < data.length; i++) {
            (bool status, bytes memory returnedData) = executors[i].call{value: values[i]}(
                data[i]
            );

            require(status, returnedData.getRevertMsg());
        }

        _updateRewards(proposalId, core.settings.executionReward, PRECISION);
    }

    function _payCommission(uint256 proposalId) internal {
        ProposalCore storage core = proposals[proposalId].core;
        IGovSettings.ProposalSettings storage settings = core.settings;

        address rewardToken = settings.rewardToken;

        if (rewardToken == address(0)) {
            return;
        }

        uint256 totalRewards = settings.creationReward +
            settings.executionReward +
            core.votesFor.ratio(settings.voteRewardsCoefficient, PRECISION);

        (, uint256 commissionPercentage, , address[3] memory commissionReceivers) = _coreProperties
            .getDEXECommissionPercentages();

        uint256 commission = rewardToken.normThisBalance().min(
            totalRewards.percentage(commissionPercentage)
        );

        _sendFunds(commissionReceivers[1], rewardToken, commission);
    }

    function _handleExecutorsAndDataForInternalProposal(
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) internal view {
        for (uint256 i; i < data.length; i++) {
            bytes4 selector = data[i].getSelector();
            uint256 executorSettings = _govSettings.executorToSettings(executors[i]);

            require(
                values[i] == 0 &&
                    executorSettings == uint256(IGovSettings.ExecutorType.INTERNAL) &&
                    (selector == IGovSettings.addSettings.selector ||
                        selector == IGovSettings.editSettings.selector ||
                        selector == IGovSettings.changeExecutors.selector ||
                        selector == IGovUserKeeper.setERC20Address.selector ||
                        selector == IGovUserKeeper.setERC721Address.selector ||
                        selector == IGovPool.editDescriptionURL.selector),
                "Gov: invalid internal data"
            );
        }
    }

    function _handleDataForValidatorBalanceProposal(
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) internal pure {
        require(executors.length == 1, "Gov: invalid executors length");

        for (uint256 i; i < data.length; i++) {
            bytes4 selector = data[i].getSelector();

            require(
                values[i] == 0 && (selector == IGovValidators.changeBalances.selector),
                "Gov: invalid internal data"
            );
        }
    }

    function _handleDataForDistributionProposal(uint256[] calldata values, bytes[] calldata data)
        internal
    {
        (uint256 decodedId, address token, uint256 amount) = abi.decode(
            data[data.length - 1][4:],
            (uint256, address, uint256)
        );

        require(decodedId == _latestProposalId, "Gov: invalid proposalId");

        for (uint256 i; i < data.length - 1; i++) {
            bytes4 selector = data[i].getSelector();

            require(
                values[i] == 0 &&
                    (selector == IERC20.approve.selector || selector == IERC20.transfer.selector),
                "Gov: invalid internal data"
            );
        }

        emit DPCreated(decodedId, msg.sender, token, amount);
    }

    function _handleDataForExistingSettingsProposal(
        uint256[] calldata values,
        bytes[] calldata data
    ) internal pure returns (bool) {
        for (uint256 i; i < data.length - 1; i++) {
            bytes4 selector = data[i].getSelector();

            if (
                values[i] != 0 ||
                (selector != IERC20.approve.selector && // same as selector != IERC721.approve.selector
                    selector != IERC721.setApprovalForAll.selector) // same as IERC1155.setApprovalForAll.selector
            ) {
                return true; // should use default settings
            }
        }

        return false;
    }

    function _vote(
        ProposalCore storage core,
        uint256 proposalId,
        uint256 voteAmount,
        uint256[] calldata voteNftIds,
        bool isMicropool,
        bool useDelegated
    ) internal {
        _voteTokens(core, proposalId, voteAmount, isMicropool, useDelegated);
        uint256 nftVoteAmount = _voteNfts(core, proposalId, voteNftIds, isMicropool, useDelegated);

        _updateRewards(
            proposalId,
            voteAmount + nftVoteAmount,
            core.settings.voteRewardsCoefficient
        );

        emit Voted(
            proposalId,
            msg.sender,
            isMicropool ? 0 : voteAmount + nftVoteAmount,
            isMicropool ? voteAmount + nftVoteAmount : 0
        );
    }

    function _voteTokens(
        ProposalCore storage core,
        uint256 proposalId,
        uint256 amount,
        bool isMicropool,
        bool useDelegated
    ) internal {
        VoteInfo storage voteInfo = _voteInfos[proposalId][msg.sender][isMicropool];

        IGovUserKeeper userKeeper = _govUserKeeper;

        userKeeper.lockTokens(proposalId, msg.sender, isMicropool, amount);
        (uint256 tokenBalance, uint256 ownedBalance) = userKeeper.tokenBalance(
            msg.sender,
            isMicropool,
            useDelegated
        );

        require(
            amount <= tokenBalance - ownedBalance - voteInfo.tokensVoted,
            "Gov: wrong vote amount"
        );

        voteInfo.totalVoted += amount;
        voteInfo.tokensVoted += amount;

        core.votesFor += amount;
    }

    function _voteNfts(
        ProposalCore storage core,
        uint256 proposalId,
        uint256[] calldata nftIds,
        bool isMicropool,
        bool useDelegated
    ) internal returns (uint256 voteAmount) {
        VoteInfo storage voteInfo = _voteInfos[proposalId][msg.sender][isMicropool];

        for (uint256 i; i < nftIds.length; i++) {
            require(voteInfo.nftsVoted.add(nftIds[i]), "Gov: NFT already voted");
        }

        IGovUserKeeper userKeeper = _govUserKeeper;

        userKeeper.lockNfts(msg.sender, isMicropool, useDelegated, nftIds);
        voteAmount = userKeeper.getNftsPowerInTokensBySnapshot(nftIds, core.nftPowerSnapshotId);

        voteInfo.totalVoted += voteAmount;

        core.votesFor += voteAmount;
    }

    function _beforeVote(
        uint256 proposalId,
        bool isMicropool,
        bool useDelegated
    ) internal returns (ProposalCore storage core) {
        core = proposals[proposalId].core;

        unlock(msg.sender, isMicropool);

        _votedInProposals[msg.sender][isMicropool].add(proposalId);

        require(
            _votedInProposals[msg.sender][isMicropool].length() <=
                _coreProperties.getGovVotesLimit(),
            "Gov: vote limit reached"
        );
        require(_getProposalState(core) == ProposalState.Voting, "Gov: vote unavailable");
        require(_canParticipate(core, isMicropool, useDelegated), "Gov: low voting power");
    }

    function _getProposalState(ProposalCore storage core) internal view returns (ProposalState) {
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
                        core.proposalId,
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

    function _quorumReached(ProposalCore storage core) internal view returns (bool) {
        return
            PERCENTAGE_100.ratio(core.votesFor, _govUserKeeper.getTotalVoteWeight()) >=
            core.settings.quorum;
    }

    function _canParticipate(
        ProposalCore storage core,
        bool isMicropool,
        bool useDelegated
    ) internal view returns (bool) {
        return
            _govUserKeeper.canParticipate(
                msg.sender,
                isMicropool,
                useDelegated,
                core.settings.minVotesForVoting,
                core.nftPowerSnapshotId
            );
    }

    function _updateRewards(
        uint256 proposalId,
        uint256 amount,
        uint256 coefficient
    ) internal {
        pendingRewards[proposalId][msg.sender] += amount.ratio(coefficient, PRECISION);
    }

    function _claimReward(uint256 proposalId) internal {
        address rewardToken = proposals[proposalId].core.settings.rewardToken;

        require(rewardToken != address(0), "Gov: rewards off");
        require(proposals[proposalId].core.executed, "Gov: proposal not executed");

        uint256 rewards = pendingRewards[proposalId][msg.sender];

        require(rewardToken.normThisBalance() >= rewards, "Gov: not enough balance");

        delete pendingRewards[proposalId][msg.sender];

        _sendFunds(msg.sender, rewardToken, rewards);

        emit RewardClaimed(proposalId, msg.sender, rewardToken, rewards);
    }

    function _sendFunds(
        address receiver,
        address token,
        uint256 amount
    ) internal {
        if (token == ETHEREUM_ADDRESS) {
            (bool status, ) = payable(receiver).call{value: amount}("");
            require(status, "Gov: failed to send eth");
        } else {
            IERC20(token).safeTransfer(receiver, amount.from18(ERC20(token).decimals()));
        }
    }

    function _emitDelegated(
        address to,
        uint256 amount,
        uint256[] calldata nfts,
        bool isDelegate
    ) internal {
        emit Delegated(msg.sender, to, amount, nfts, isDelegate);
    }
}
