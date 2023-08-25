// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "../../../interfaces/factory/IPoolRegistry.sol";

import "../../../interfaces/gov/IGovPool.sol";
import "../../../interfaces/gov/proposals/IProposalValidator.sol";
import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../../interfaces/gov/settings/IGovSettings.sol";
import "../../../interfaces/gov/validators/IGovValidators.sol";
import "../../../interfaces/gov/ERC721/IERC721Expert.sol";

import "../../utils/DataHelper.sol";

import "../../../gov/GovPool.sol";

library GovPoolCreate {
    using EnumerableSet for EnumerableSet.UintSet;
    using DataHelper for bytes;

    event ProposalCreated(
        uint256 proposalId,
        string proposalDescription,
        IGovPool.ProposalAction[] actionsOnFor,
        IGovPool.ProposalAction[] actionsOnAgainst,
        uint256 quorum,
        uint256 proposalSettings,
        address rewardToken,
        address sender
    );
    event MovedToValidators(uint256 proposalId, address sender);

    function createProposal(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => EnumerableSet.UintSet) storage restrictedProposals,
        string calldata _descriptionURL,
        IGovPool.ProposalAction[] calldata actionsOnFor,
        IGovPool.ProposalAction[] calldata actionsOnAgainst
    ) external {
        (
            IGovSettings.ProposalSettings memory settings,
            uint256 settingsId,
            uint256 snapshotId
        ) = _validateProposal(actionsOnFor, actionsOnAgainst);

        uint256 proposalId = GovPool(payable(address(this))).latestProposalId();

        _restrictInterestedUsersFromProposal(restrictedProposals, actionsOnFor, proposalId);

        IGovPool.Proposal storage proposal = proposals[proposalId];

        proposal.core = IGovPool.ProposalCore({
            settings: settings,
            voteEnd: uint64(block.timestamp + settings.duration),
            executeAfter: 0,
            executionTime: 0,
            votesFor: 0,
            votesAgainst: 0,
            nftPowerSnapshotId: snapshotId,
            givenRewards: 0
        });
        proposal.descriptionURL = _descriptionURL;

        for (uint256 i; i < actionsOnFor.length; i++) {
            proposal.actionsOnFor.push(actionsOnFor[i]);
        }

        for (uint256 i; i < actionsOnAgainst.length; i++) {
            proposal.actionsOnAgainst.push(actionsOnAgainst[i]);
        }

        _canCreate(settings, snapshotId);

        emit ProposalCreated(
            proposalId,
            _descriptionURL,
            actionsOnFor,
            actionsOnAgainst,
            settings.quorum,
            settingsId,
            settings.rewardsInfo.rewardToken,
            msg.sender
        );
    }

    function moveProposalToValidators(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        uint256 proposalId
    ) external {
        IGovPool.ProposalCore storage core = proposals[proposalId].core;
        (, , address govValidators, , ) = IGovPool(address(this)).getHelperContracts();

        require(
            IGovPool(address(this)).getProposalState(proposalId) ==
                IGovPool.ProposalState.WaitingForVotingTransfer,
            "Gov: can't be moved"
        );

        IGovValidators(govValidators).createExternalProposal(
            proposalId,
            IGovValidators.ProposalSettings(
                core.settings.durationValidators,
                core.settings.executionDelay,
                core.settings.quorumValidators
            )
        );

        emit MovedToValidators(proposalId, msg.sender);
    }

    function _validateProposal(
        IGovPool.ProposalAction[] calldata actionsFor,
        IGovPool.ProposalAction[] calldata actionsAgainst
    )
        internal
        returns (
            IGovSettings.ProposalSettings memory settings,
            uint256 settingsId,
            uint256 snapshotId
        )
    {
        require(actionsFor.length != 0, "Gov: invalid array length");

        address mainExecutor = actionsFor[actionsFor.length - 1].executor;

        _validateProposalCreation(mainExecutor, actionsFor);

        (address govSettingsAddress, address userKeeper, , , ) = IGovPool(address(this))
            .getHelperContracts();

        IGovSettings govSettings = IGovSettings(govSettingsAddress);

        settingsId = govSettings.executorToSettings(mainExecutor);

        bool forceDefaultSettings = _handleDataForProposal(settingsId, govSettings, actionsFor);

        if (actionsAgainst.length != 0) {
            _validateDataCorrespondence(actionsFor, actionsAgainst);
        }

        if (forceDefaultSettings) {
            settingsId = uint256(IGovSettings.ExecutorType.DEFAULT);
            settings = govSettings.getDefaultSettings();
        } else {
            settings = govSettings.getExecutorSettings(mainExecutor);
        }

        snapshotId = IGovUserKeeper(userKeeper).createNftPowerSnapshot();
    }

    function _restrictInterestedUsersFromProposal(
        mapping(address => EnumerableSet.UintSet) storage restrictedProposals,
        IGovPool.ProposalAction[] calldata actions,
        uint256 proposalId
    ) internal {
        for (uint256 i; i < actions.length; i++) {
            IGovPool.ProposalAction calldata action = actions[i];

            if (
                action.executor == address(this) &&
                action.data.getSelector() == IGovPool.undelegateTreasury.selector
            ) {
                address user = abi.decode(action.data[4:36], (address));
                restrictedProposals[user].add(proposalId);
            }
        }
    }

    function _validateProposalCreation(
        address executor,
        IGovPool.ProposalAction[] calldata actionsFor
    ) internal view {
        (bool ok, bytes memory data) = executor.staticcall(
            abi.encodeWithSelector(IProposalValidator.validate.selector, actionsFor)
        );

        require(!ok || data.length == 0 || abi.decode(data, (bool)), "Gov: validation failed");
    }

    function _canCreate(
        IGovSettings.ProposalSettings memory settings,
        uint256 snapshotId
    ) internal view {
        IGovPool govPool = IGovPool(address(this));

        (, , address dexeExpertNft, ) = govPool.getNftContracts();

        if (IERC721Expert(dexeExpertNft).isExpert(msg.sender)) {
            return;
        }

        (, address userKeeper, , , ) = govPool.getHelperContracts();

        require(
            IGovUserKeeper(userKeeper).canCreate(
                msg.sender,
                settings.delegatedVotingAllowed
                    ? IGovPool.VoteType.DelegatedVote
                    : IGovPool.VoteType.PersonalVote,
                settings.minVotesForCreating,
                snapshotId
            ),
            "Gov: low creating power"
        );
    }

    function _handleDataForInternalProposal(
        IGovSettings govSettings,
        IGovPool.ProposalAction[] calldata actions
    ) internal view {
        for (uint256 i; i < actions.length; i++) {
            bytes4 selector = actions[i].data.getSelector();
            uint256 executorSettings = govSettings.executorToSettings(actions[i].executor);

            require(
                actions[i].value == 0 &&
                    executorSettings == uint256(IGovSettings.ExecutorType.INTERNAL) &&
                    (selector == IGovSettings.addSettings.selector ||
                        selector == IGovSettings.editSettings.selector ||
                        selector == IGovSettings.changeExecutors.selector ||
                        selector == IGovUserKeeper.setERC20Address.selector ||
                        selector == IGovUserKeeper.setERC721Address.selector ||
                        selector == IGovPool.editDescriptionURL.selector ||
                        selector == IGovPool.setNftMultiplierAddress.selector ||
                        selector == IGovPool.changeVerifier.selector ||
                        selector == IGovPool.delegateTreasury.selector ||
                        selector == IGovPool.undelegateTreasury.selector ||
                        selector == IGovPool.changeBABTRestriction.selector ||
                        selector == IGovPool.setCreditInfo.selector),
                "Gov: invalid internal data"
            );
        }
    }

    function _handleDataForProposal(
        uint256 settingsId,
        IGovSettings govSettings,
        IGovPool.ProposalAction[] calldata actions
    ) internal view returns (bool) {
        if (settingsId == uint256(IGovSettings.ExecutorType.INTERNAL)) {
            _handleDataForInternalProposal(govSettings, actions);
            return false;
        }

        if (settingsId == uint256(IGovSettings.ExecutorType.VALIDATORS)) {
            _handleDataForValidatorBalanceProposal(actions);
            return false;
        }

        if (settingsId == uint256(IGovSettings.ExecutorType.DEFAULT)) {
            return false;
        }

        return _handleDataForExistingSettingsProposal(govSettings, actions);
    }

    function _handleDataForExistingSettingsProposal(
        IGovSettings govSettings,
        IGovPool.ProposalAction[] calldata actions
    ) internal view returns (bool) {
        uint256 lastSettings = govSettings.executorToSettings(
            actions[actions.length - 1].executor
        );

        for (uint256 i; i < actions.length - 1; i++) {
            bytes4 selector = actions[i].data.getSelector();

            if (
                govSettings.executorToSettings(actions[i].executor) != lastSettings &&
                (actions[i].value != 0 ||
                    (selector != IERC20.approve.selector && // same as selector != IERC721.approve.selector
                        selector != IERC721.setApprovalForAll.selector)) // same as IERC1155.setApprovalForAll.selector
            ) {
                return true; // should use default settings
            }
        }

        return false;
    }

    function _validateDataCorrespondence(
        IGovPool.ProposalAction[] calldata actionsFor,
        IGovPool.ProposalAction[] calldata actionsAgainst
    ) internal view {
        require(actionsFor.length == actionsAgainst.length, "Gov: invalid actions length");

        (, , , address poolRegistryAddress, ) = IGovPool(address(this)).getHelperContracts();
        IPoolRegistry poolRegistry = IPoolRegistry(poolRegistryAddress);

        for (uint256 i; i < actionsFor.length; i++) {
            IGovPool.ProposalAction calldata actionFor = actionsFor[i];
            IGovPool.ProposalAction calldata actionAgainst = actionsAgainst[i];

            address executor = actionFor.executor;
            require(executor == actionAgainst.executor, "Gov: invalid executor");
            require(poolRegistry.isGovPool(executor), "Gov: invalid executor");

            bytes4 selector = actionFor.data.getSelector();
            require(selector == actionAgainst.data.getSelector(), "Gov: invalid selector");
            require(selector == IGovPool.vote.selector, "Gov: invalid selector");

            (uint256 proposalIdFor, bool isVoteForOnFor) = _decodeVoteFunction(actionFor);
            (uint256 proposalIdAgainst, bool isVoteForOnAgainst) = _decodeVoteFunction(
                actionAgainst
            );
            require(proposalIdFor == proposalIdAgainst, "Gov: invalid proposal id");

            require(isVoteForOnFor && !isVoteForOnAgainst, "Gov: invalid vote");
        }
    }

    function _handleDataForValidatorBalanceProposal(
        IGovPool.ProposalAction[] calldata actions
    ) internal pure {
        require(actions.length == 1, "Gov: invalid executors length");

        for (uint256 i; i < actions.length; i++) {
            bytes4 selector = actions[i].data.getSelector();

            require(
                actions[i].value == 0 && (selector == IGovValidators.changeBalances.selector),
                "Gov: invalid internal data"
            );
        }
    }

    function _decodeVoteFunction(
        IGovPool.ProposalAction calldata action
    ) internal pure returns (uint256 proposalId, bool isVoteFor) {
        (proposalId, isVoteFor) = abi.decode(action.data[4:68], (uint256, bool));
    }
}
