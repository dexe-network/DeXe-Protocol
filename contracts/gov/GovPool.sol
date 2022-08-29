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

import "../interfaces/gov/settings/IGovSettings.sol";
import "../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../interfaces/gov/validators/IGovValidators.sol";
import "../interfaces/gov/IGovPool.sol";
import "../interfaces/gov/validators/IGovValidators.sol";

import "../libs/gov-user-keeper/GovUserKeeperLocal.sol";
import "../libs/math/MathHelper.sol";
import "../libs/utils/DataHelper.sol";

import "../core/Globals.sol";

contract GovPool is
    IGovPool,
    OwnableUpgradeable,
    ERC721HolderUpgradeable,
    ERC1155HolderUpgradeable
{
    /// @dev govVote usings
    using Math for uint256;
    using MathHelper for uint256;
    using EnumerableSet for EnumerableSet.UintSet;
    using GovUserKeeperLocal for *;

    /// @dev govFee usings
    using SafeERC20 for IERC20;
    using Math for uint64;

    /// @dev govUserKeeperController usings
    using ShrinkableArray for uint256[];
    using ShrinkableArray for ShrinkableArray.UintArray;
    using ArrayHelper for uint256[];

    using DataHelper for bytes;

    /// @dev govCreator vars
    IGovSettings public govSetting;
    IGovUserKeeper public govUserKeeper;
    IGovValidators public govValidators;
    address public distributionProposal;
    uint256 private _latestProposalId;
    mapping(uint256 => Proposal) public proposals; // proposalId => info

    /// @dev govVote vars
    uint256 public votesLimit;
    mapping(uint256 => uint256) private _totalVotedInProposal; // proposalId => total voted
    mapping(uint256 => mapping(address => mapping(bool => VoteInfo))) internal _voteInfos; // proposalId => voter => isMicropool => info
    mapping(address => mapping(bool => EnumerableSet.UintSet)) internal _votedInProposals; // voter => isMicropool => active proposal ids

    /// @dev govFee vars
    uint64 private _deployedAt;
    uint256 public feePercentage;
    /// @dev zero address - native token
    mapping(address => uint64) public lastUpdate; // token address => last update

    /// @dev govPool vars
    string public descriptionURL;

    mapping(uint256 => mapping(address => uint256)) public pendingRewards;

    function __GovPool_init(
        address govSettingAddress,
        address govUserKeeperAddress,
        address distributionProposalAddress,
        address validatorsAddress,
        uint256 _votesLimit,
        uint256 _feePercentage,
        string calldata _descriptionURL
    ) external initializer {
        __ERC721Holder_init();
        __ERC1155Holder_init();
        __Ownable_init();

        /// @dev govCreator requires
        require(govSettingAddress != address(0), "GovC: address is zero (1)");
        require(govUserKeeperAddress != address(0), "GovC: address is zero (2)");

        /// @dev govVote requires
        require(_votesLimit > 0);

        /// @dev govFee requires
        require(
            _feePercentage <= PERCENTAGE_100,
            "GovFee: `_feePercentage` can't be more than 100%"
        );

        /// @dev govCreator inits
        govSetting = IGovSettings(govSettingAddress);
        govUserKeeper = IGovUserKeeper(govUserKeeperAddress);
        govValidators = IGovValidators(validatorsAddress);
        distributionProposal = distributionProposalAddress;

        /// @dev govVote inits
        votesLimit = _votesLimit;

        /// @dev govFee inits
        _deployedAt = uint64(block.timestamp);
        feePercentage = _feePercentage;

        /// @dev govPool inits
        descriptionURL = _descriptionURL;
    }

    /// @dev govCreator external functs
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
            "GovC: invalid array length"
        );

        uint256 proposalId = ++_latestProposalId;

        address mainExecutor = executors[executors.length - 1];
        (, IGovSettings.ExecutorType executorType) = govSetting.executorInfo(mainExecutor);

        bool forceDefaultSettings;
        IGovSettings.ProposalSettings memory settings;

        if (executorType == IGovSettings.ExecutorType.INTERNAL) {
            _handleExecutorsAndDataForInternalProposal(executors, values, data);
        } else if (executorType == IGovSettings.ExecutorType.DISTRIBUTION) {
            _handleDataForDistributionProposal(executors, values, data);
        } else if (executorType == IGovSettings.ExecutorType.VALIDATORS) {
            _handleDataForValidatorBalanceProposal(executors, values, data);
        } else if (executorType == IGovSettings.ExecutorType.TRUSTED) {
            forceDefaultSettings = _handleDataForExistingSettingsProposal(values, data);
        }

        if (forceDefaultSettings) {
            settings = govSetting.getDefaultSettings();
        } else {
            settings = govSetting.getSettings(mainExecutor);
        }

        require(
            govUserKeeper.canParticipate(
                msg.sender,
                false,
                !settings.delegatedVotingAllowed,
                1,
                1
            ),
            "GovC: low balance"
        );

        proposals[proposalId] = Proposal({
            core: ProposalCore({
                settings: settings,
                executed: false,
                voteEnd: uint64(block.timestamp + settings.duration),
                votesFor: 0,
                nftPowerSnapshotId: govUserKeeper.createNftPowerSnapshot(),
                proposalId: proposalId
            }),
            descriptionURL: _descriptionURL,
            executors: executors,
            values: values,
            data: data
        });

        pendingRewards[proposalId][msg.sender] = settings.creationRewards;
    }

    function getProposalInfo(uint256 proposalId)
        external
        view
        override
        returns (address[] memory, bytes[] memory)
    {
        return (proposals[proposalId].executors, proposals[proposalId].data);
    }

    /// @dev govVote functs
    function vote(
        uint256 proposalId,
        uint256 depositAmount,
        uint256[] calldata depositNftIds,
        uint256 voteAmount,
        uint256[] calldata voteNftIds
    ) external override {
        require(voteAmount > 0 || voteNftIds.length > 0, "GovV: empty vote");

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
        require(voteAmount > 0 || voteNftIds.length > 0, "GovV: empty delegated vote");
        require(
            proposals[proposalId].core.settings.delegatedVotingAllowed,
            "GovV: delegated voting unavailable"
        );

        ProposalCore storage core = _beforeVote(proposalId, true, false);

        _voteTokens(core, proposalId, voteAmount, true, false);
        _voteNfts(core, proposalId, voteNftIds, true, false);
    }

    function moveProposalToValidators(uint256 proposalId) external override {
        ProposalCore storage core = proposals[proposalId].core;
        ProposalState state = _getProposalState(core);

        require(state == ProposalState.WaitingForVotingTransfer, "GovV: can't be moved");

        govValidators.createExternalProposal(
            proposalId,
            core.settings.durationValidators,
            core.settings.quorumValidators
        );
    }

    function getTotalVotes(
        uint256 proposalId,
        address voter,
        bool isMicropool
    ) external view override returns (uint256, uint256) {
        return (
            _totalVotedInProposal[proposalId],
            _voteInfos[proposalId][voter][isMicropool].totalVoted
        );
    }

    function getProposalState(uint256 proposalId) external view override returns (ProposalState) {
        return _getProposalState(proposals[proposalId].core);
    }

    /// @dev govFee functs
    function withdrawFee(address tokenAddress, address recipient) external override onlyOwner {
        uint64 _lastUpdate = uint64(lastUpdate[tokenAddress].max(_deployedAt));

        lastUpdate[tokenAddress] = uint64(block.timestamp);

        uint256 balance;
        uint256 toWithdraw;

        if (tokenAddress != address(0)) {
            balance = IERC20(tokenAddress).balanceOf(address(this));
        } else {
            balance = address(this).balance;
        }

        uint256 fee = feePercentage.ratio(block.timestamp - _lastUpdate, 1 days * 365);
        toWithdraw = balance.min(balance.percentage(fee));

        require(toWithdraw > 0, "GFee: nothing to withdraw");

        if (tokenAddress != address(0)) {
            IERC20(tokenAddress).safeTransfer(recipient, toWithdraw);
        } else {
            payable(recipient).transfer(toWithdraw);
        }
    }

    /// @dev govUserKeeperController functs
    function deposit(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) public override {
        require(amount > 0 || nftIds.length > 0, "GovUKC: empty deposit");

        govUserKeeper.depositTokens.exec(receiver, amount);
        govUserKeeper.depositNfts.exec(receiver, nftIds);
    }

    function withdraw(
        address receiver,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "GovUKC: empty withdrawal");

        unlock(msg.sender, false);

        govUserKeeper.withdrawTokens.exec(receiver, amount);
        govUserKeeper.withdrawNfts.exec(receiver, nftIds);
    }

    function delegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "GovUKC: empty delegation");

        unlock(msg.sender, false);

        govUserKeeper.delegateTokens.exec(delegatee, amount);
        govUserKeeper.delegateNfts.exec(delegatee, nftIds);
    }

    function undelegate(
        address delegatee,
        uint256 amount,
        uint256[] calldata nftIds
    ) external override {
        require(amount > 0 || nftIds.length > 0, "GovUKC: empty undelegation");

        unlock(delegatee, true);

        govUserKeeper.undelegateTokens.exec(delegatee, amount);
        govUserKeeper.undelegateNfts.exec(delegatee, nftIds);
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
        ) = getProposals(user, false);
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
        ) = getProposals(delegatee, true);
        uint256[] memory unlockedNfts = getUnlockedNfts(unlockedIds, delegatee, true);

        return
            govUserKeeper.getUndelegateableAssets(delegator, delegatee, lockedIds, unlockedNfts);
    }

    function getProposals(address user, bool isMicropool)
        public
        view
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
    ) public view returns (uint256[] memory unlockedNfts) {
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
                "GovUKC: hasn't voted for this proposal"
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

    /// @dev govPool functs
    function execute(uint256 proposalId) public override {
        Proposal storage proposal = proposals[proposalId];

        require(
            _getProposalState(proposal.core) == ProposalState.Succeeded,
            "Gov: invalid proposal status"
        );

        proposal.core.executed = true;

        address[] memory executors = proposal.executors;
        uint256[] memory values = proposal.values;
        bytes[] memory data = proposal.data;

        for (uint256 i; i < data.length; i++) {
            (bool status, bytes memory returnedData) = executors[i].call{value: values[i]}(
                data[i]
            );

            if (!status) {
                revert(returnedData.getRevertMsg());
            }
        }

        pendingRewards[proposalId][msg.sender] += proposal.core.settings.executionReward;
    }

    function claimReward(uint256[] calldata proposalIds) external override {
        for (uint256 i; i < proposalIds.length; i++) {
            _claimReward(proposalIds[i]);
        }
    }

    function executeAndClaim(uint256 proposalId) external override {
        execute(proposalId);
        _claimReward(proposalId);
    }

    receive() external payable {}

    /// @dev govCreator internal functs

    function _handleExecutorsAndDataForInternalProposal(
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) private pure {
        for (uint256 i; i < data.length; i++) {
            bytes4 selector = data[i].getSelector();
            require(
                values[i] == 0 &&
                    executors[executors.length - 1] == executors[i] &&
                    (selector == IGovSettings.addSettings.selector ||
                        selector == IGovSettings.editSettings.selector ||
                        selector == IGovSettings.changeExecutors.selector),
                "GovC: invalid internal data"
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
                (selector != IERC20.approve.selector &&
                    selector != IERC721.approve.selector &&
                    selector != IERC721.setApprovalForAll.selector &&
                    selector != IERC1155.setApprovalForAll.selector)
            ) {
                return true; // should use default settings
            }
        }

        return false;
    }

    function _handleDataForDistributionProposal(
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) private view {
        (uint256 decodedId, , ) = abi.decode(
            data[data.length - 1][4:],
            (uint256, address, uint256)
        );
        require(decodedId == _latestProposalId, "GovC: invalid proposalId");
        require(distributionProposal == executors[executors.length - 1], "GovC: invalid executor");

        for (uint256 i; i < data.length - 1; i++) {
            bytes4 selector = data[i].getSelector();

            require(
                values[i] == 0 &&
                    (selector == IERC20.approve.selector ||
                        selector == IERC20.transfer.selector ||
                        selector == IERC20.transferFrom.selector),
                "GovC: invalid internal data"
            );
        }
    }

    function _handleDataForValidatorBalanceProposal(
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) private pure {
        for (uint256 i; i < data.length; i++) {
            bytes4 selector = data[i].getSelector();
            require(
                values[i] == 0 &&
                    executors[executors.length - 1] == executors[i] &&
                    (selector == IGovValidators.changeBalances.selector),
                "GovC: invalid internal data"
            );
        }
    }

    /// @dev govVote internal functs

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

        require(amount <= tokenBalance - voteInfo.tokensVoted, "GovV: wrong vote amount");

        voteInfo.totalVoted += amount;
        voteInfo.tokensVoted += amount;

        _totalVotedInProposal[proposalId] += amount;

        core.votesFor += amount;

        pendingRewards[proposalId][msg.sender] += getVotingRewards(
            amount,
            core.settings.voteRewardsCoefficient
        );
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
            require(i == 0 || nftIds[i] > nftIds[i - 1], "GovV: wrong NFT order");
            require(!voteInfo.nftsVoted.contains(nftIds[i]), "GovV: NFT already voted");
        }

        IGovUserKeeper userKeeper = govUserKeeper;

        userKeeper.lockNfts(msg.sender, isMicropool, useDelegated, nftIds);
        uint256 voteAmount = userKeeper.getNftsPowerInTokens(nftIds, core.nftPowerSnapshotId);

        for (uint256 i; i < nftIds.length; i++) {
            voteInfo.nftsVoted.add(nftIds[i]);
        }

        voteInfo.totalVoted += voteAmount;

        _totalVotedInProposal[proposalId] += voteAmount;

        core.votesFor += voteAmount;

        pendingRewards[proposalId][msg.sender] +=
            (voteAmount * core.settings.voteRewardsCoefficient) /
            PRECISION;
    }

    function _beforeVote(
        uint256 proposalId,
        bool isMicropool,
        bool useDelegated
    ) private returns (ProposalCore storage) {
        ProposalCore storage core = proposals[proposalId].core;

        _votedInProposals[msg.sender][isMicropool].add(proposalId);

        require(
            _votedInProposals[msg.sender][isMicropool].length() <= votesLimit,
            "GovV: vote limit reached"
        );
        require(_getProposalState(core) == ProposalState.Voting, "GovV: vote unavailable");
        require(
            govUserKeeper.canParticipate(
                msg.sender,
                isMicropool,
                useDelegated,
                core.settings.minTokenBalance,
                core.settings.minNftBalance
            ),
            "GovV: low balance"
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

                    if (status == IGovValidators.ProposalState.Voting) {
                        return ProposalState.ValidatorVoting;
                    }

                    if (status == IGovValidators.ProposalState.Succeeded) {
                        return ProposalState.Succeeded;
                    }

                    if (status == IGovValidators.ProposalState.Defeated) {
                        return ProposalState.Defeated;
                    }
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
        uint256 totalVoteWeight = govUserKeeper.getTotalVoteWeight();

        return
            totalVoteWeight == 0
                ? false
                : PERCENTAGE_100.ratio(core.votesFor, totalVoteWeight) >= core.settings.quorum;
    }

    function _claimReward(uint256 proposalId) internal {
        IGovSettings.ProposalSettings storage proposalSettings = proposals[proposalId]
            .core
            .settings;
        require(proposalSettings.rewardToken != address(0), "GovP: rewards off");

        require(proposals[proposalId].core.executed, "GovP: proposal not executed");

        uint256 toPay = pendingRewards[proposalId][msg.sender];
        pendingRewards[proposalId][msg.sender] = 0;

        uint256 balance;

        if (proposalSettings.rewardToken == ETHEREUM_ADDRESS) {
            balance = address(this).balance;
        } else {
            balance = IERC20(proposalSettings.rewardToken).balanceOf(address(this));
        }

        require(balance > 0, "GovP: zero contract balance");
        toPay = balance < toPay ? balance : toPay;

        if (proposalSettings.rewardToken == ETHEREUM_ADDRESS) {
            (bool status, ) = payable(msg.sender).call{value: toPay}("");
            require(status, "GovP: Failed to send eth");
        } else {
            IERC20(proposalSettings.rewardToken).safeTransfer(msg.sender, toPay);
        }
    }

    function getVotingRewards(uint256 amount, uint256 voteRewardsCoefficient)
        internal
        pure
        returns (uint256)
    {
        return (amount * voteRewardsCoefficient) / PRECISION;
    }
}
