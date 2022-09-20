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
    using GovUserKeeperLocal for *;

    IGovSettings public govSetting;
    IGovUserKeeper public govUserKeeper;
    IGovValidators public govValidators;
    address public distributionProposal;

    ICoreProperties internal _coreProperties;

    string public descriptionURL;

    uint256 internal _latestProposalId;

    mapping(uint256 => Proposal) public proposals; // proposalId => info

    mapping(uint256 => mapping(address => mapping(bool => VoteInfo))) internal _voteInfos; // proposalId => voter => isMicropool => info
    mapping(address => mapping(bool => EnumerableSet.UintSet)) internal _votedInProposals; // voter => isMicropool => active proposal ids

    mapping(uint256 => mapping(address => uint256)) public pendingRewards; // proposalId => user => tokens amount

    event ProposalCreated(uint256 proposalId, address sender, uint256 quorum);
    event Delegated(address from, address to, uint256 amount);
    event Undelegated(address from, address to, uint256 amount);
    event DelegatedNFT(address from, address to, uint256[] tokens);
    event UndelegatedNFT(address from, address to, uint256[] tokens);
    event Voted(uint256 proposalId, address sender, uint256 personalVote, uint256 delegatedVote);
    event DPCreated(uint256 proposalId, address sender, address token, uint256 amount);
    event ProposalExecuted(uint256 proposalId, address sender);
    event RewardsClaimed(
        uint256[] proposalIds,
        address sender,
        address[] tokens,
        uint256[] amounts
    );

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
        govSetting = IGovSettings(govSettingAddress);
        govUserKeeper = IGovUserKeeper(govUserKeeperAddress);
        govValidators = IGovValidators(validatorsAddress);
        distributionProposal = distributionProposalAddress;

        descriptionURL = _descriptionURL;
    }

    function setDependencies(address contractsRegistry) public virtual override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _coreProperties = ICoreProperties(registry.getCorePropertiesContract());
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
        (, IGovSettings.ExecutorType executorType) = govSetting.executorInfo(mainExecutor);

        bool forceDefaultSettings;
        IGovSettings.ProposalSettings memory settings;

        if (executorType == IGovSettings.ExecutorType.INTERNAL) {
            _handleExecutorsAndDataForInternalProposal(executors, values, data);
        } else if (executorType == IGovSettings.ExecutorType.VALIDATORS) {
            _handleDataForValidatorBalanceProposal(executors, values, data);
        } else if (executorType == IGovSettings.ExecutorType.DISTRIBUTION) {
            _handleDataForDistributionProposal(values, data);
        } else if (executorType == IGovSettings.ExecutorType.TRUSTED) {
            forceDefaultSettings = _handleDataForExistingSettingsProposal(values, data);
        }

        if (forceDefaultSettings) {
            settings = govSetting.getDefaultSettings();
        } else {
            settings = govSetting.getSettings(mainExecutor);
        }

        uint256 nftSnapshot = govUserKeeper.createNftPowerSnapshot();

        require(
            govUserKeeper.canParticipate(
                msg.sender,
                false,
                !settings.delegatedVotingAllowed,
                settings.minVotesForCreating,
                nftSnapshot
            ),
            "Gov: low voting power"
        );

        proposals[proposalId] = Proposal({
            core: ProposalCore({
                settings: settings,
                executed: false,
                voteEnd: uint64(block.timestamp + settings.duration),
                votesFor: 0,
                nftPowerSnapshotId: nftSnapshot,
                proposalId: proposalId
            }),
            descriptionURL: _descriptionURL,
            executors: executors,
            values: values,
            data: data
        });

        _updateRewards(proposalId, settings.creationReward, PRECISION);
    }

    function vote(
        uint256 proposalId,
        uint256 depositAmount,
        uint256[] calldata depositNftIds,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external override {
        require(voteAmount > 0 || voteNftIds.length > 0, "Gov: empty vote");

        govUserKeeper.depositTokens.exec(msg.sender, depositAmount);
        govUserKeeper.depositNfts.exec(msg.sender, depositNftIds);

        bool useDelegated = !proposals[proposalId].core.settings.delegatedVotingAllowed;
        ProposalCore storage core = _beforeVote(proposalId, false, useDelegated);

        _voteTokens(core, proposalId, voteAmount, false, useDelegated);
        _voteNfts(core, proposalId, voteNftIds, false, useDelegated);
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

        _voteTokens(core, proposalId, voteAmount, true, false);
        _voteNfts(core, proposalId, voteNftIds, true, false);
    }

    function deposit(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) public override {
        require(amount > 0 || nftIds.length > 0, "Gov: empty deposit");

        govUserKeeper.depositTokens.exec(receiver, amount);
        govUserKeeper.depositNfts.exec(receiver, nftIds);
    }

    function withdraw(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "Gov: empty withdrawal");

        unlock(msg.sender, false);

        govUserKeeper.withdrawTokens.exec(receiver, amount);
        govUserKeeper.withdrawNfts.exec(receiver, nftIds);
    }

    function delegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "Gov: empty delegation");

        unlock(msg.sender, false);

        govUserKeeper.delegateTokens.exec(delegatee, amount);
        govUserKeeper.delegateNfts.exec(delegatee, nftIds);
    }

    function undelegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "Gov: empty undelegation");

        unlock(delegatee, true);

        govUserKeeper.undelegateTokens.exec(delegatee, amount);
        govUserKeeper.undelegateNfts.exec(delegatee, nftIds);
    }

    function unlock(address user, bool isMicropool) public override {
        unlockInProposals(_votedInProposals[user][isMicropool].values(), user, isMicropool);
    }

    function unlockInProposals(
        uint256[] memory proposalIds,
        address user,
        bool isMicropool
    ) public override {
        IGovUserKeeper userKeeper = govUserKeeper;

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
    }

    function moveProposalToValidators(uint256 proposalId) external override {
        ProposalCore storage core = proposals[proposalId].core;
        ProposalState state = _getProposalState(core);

        require(state == ProposalState.WaitingForVotingTransfer, "Gov: can't be moved");

        govValidators.createExternalProposal(
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

        return govUserKeeper.getWithdrawableAssets(user, lockedIds, unlockedNfts);
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
            govUserKeeper.getUndelegateableAssets(delegator, delegatee, lockedIds, unlockedNfts);
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

        uint256 commission = rewardToken.thisBalance().min(
            totalRewards.percentage(commissionPercentage)
        );

        _sendFunds(commissionReceivers[1], rewardToken, commission);
    }

    function _handleExecutorsAndDataForInternalProposal(
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) private view {
        for (uint256 i; i < data.length; i++) {
            bytes4 selector = data[i].getSelector();
            (, IGovSettings.ExecutorType executorType) = govSetting.executorInfo(executors[i]);

            require(
                values[i] == 0 &&
                    executorType == IGovSettings.ExecutorType.INTERNAL &&
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
    ) private pure {
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
        private
        view
    {
        (uint256 decodedId, , ) = abi.decode(
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
    }

    function _handleDataForExistingSettingsProposal(
        uint256[] calldata values,
        bytes[] calldata data
    ) private pure returns (bool) {
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

    function _voteTokens(
        ProposalCore storage core,
        uint256 proposalId,
        uint256 amount,
        bool isMicropool,
        bool useDelegated
    ) private {
        VoteInfo storage voteInfo = _voteInfos[proposalId][msg.sender][isMicropool];

        IGovUserKeeper userKeeper = govUserKeeper;

        userKeeper.lockTokens(proposalId, msg.sender, isMicropool, amount);
        uint256 tokenBalance = userKeeper.tokenBalance(msg.sender, isMicropool, useDelegated);

        require(amount <= tokenBalance - voteInfo.tokensVoted, "Gov: wrong vote amount");

        voteInfo.totalVoted += amount;
        voteInfo.tokensVoted += amount;

        core.votesFor += amount;

        _updateRewards(proposalId, amount, core.settings.voteRewardsCoefficient);
    }

    function _voteNfts(
        ProposalCore storage core,
        uint256 proposalId,
        uint256[] calldata nftIds,
        bool isMicropool,
        bool useDelegated
    ) private {
        VoteInfo storage voteInfo = _voteInfos[proposalId][msg.sender][isMicropool];

        for (uint256 i; i < nftIds.length; i++) {
            require(i == 0 || nftIds[i] > nftIds[i - 1], "Gov: wrong NFT order");
            require(!voteInfo.nftsVoted.contains(nftIds[i]), "Gov: NFT already voted");
        }

        IGovUserKeeper userKeeper = govUserKeeper;

        userKeeper.lockNfts(msg.sender, isMicropool, useDelegated, nftIds);
        uint256 voteAmount = userKeeper.getNftsPowerInTokens(nftIds, core.nftPowerSnapshotId);

        for (uint256 i; i < nftIds.length; i++) {
            voteInfo.nftsVoted.add(nftIds[i]);
        }

        voteInfo.totalVoted += voteAmount;

        core.votesFor += voteAmount;

        _updateRewards(proposalId, voteAmount, core.settings.voteRewardsCoefficient);
    }

    function _beforeVote(
        uint256 proposalId,
        bool isMicropool,
        bool useDelegated
    ) private returns (ProposalCore storage) {
        ProposalCore storage core = proposals[proposalId].core;

        _votedInProposals[msg.sender][isMicropool].add(proposalId);

        require(
            _votedInProposals[msg.sender][isMicropool].length() <=
                _coreProperties.getGovVotesLimit(),
            "Gov: vote limit reached"
        );
        require(_getProposalState(core) == ProposalState.Voting, "Gov: vote unavailable");
        require(
            govUserKeeper.canParticipate(
                msg.sender,
                isMicropool,
                useDelegated,
                core.settings.minVotesForVoting,
                core.nftPowerSnapshotId
            ),
            "Gov: low voting power"
        );

        return core;
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
                if (core.settings.validatorsVote && govValidators.validatorsCount() > 0) {
                    IGovValidators.ProposalState status = govValidators.getProposalState(
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

    function _quorumReached(ProposalCore storage core) private view returns (bool) {
        return
            PERCENTAGE_100.ratio(core.votesFor, govUserKeeper.getTotalVoteWeight()) >=
            core.settings.quorum;
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

        require(rewardToken.thisBalance() >= rewards, "Gov: not enough balance");

        delete pendingRewards[proposalId][msg.sender];

        _sendFunds(msg.sender, rewardToken, rewards);
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
            IERC20(token).safeTransfer(receiver, amount);
        }
    }
}
