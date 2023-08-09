// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "../../../interfaces/gov/IGovPool.sol";
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
        string misc,
        uint256 quorum,
        uint256 proposalSettings,
        address rewardToken,
        address sender
    );
    event DPCreated(uint256 proposalId, address sender, address token, uint256 amount);
    event MovedToValidators(uint256 proposalId, address sender);

    function createProposal(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        mapping(address => EnumerableSet.UintSet) storage restrictedProposals,
        string calldata _descriptionURL,
        string calldata misc,
        IGovPool.ProposalAction[] calldata actionsOnFor,
        IGovPool.ProposalAction[] calldata actionsOnAgainst
    ) external {
        (
            IGovSettings.ProposalSettings memory settings,
            uint256 settingsId,
            uint256 snapshotId
        ) = _validateProposal(actionsOnFor, actionsOnAgainst);

        uint256 proposalId = GovPool(payable(address(this))).latestProposalId();

        _restrictInterestedUsersFromProposal(
            restrictedProposals,
            actionsOnFor,
            actionsOnAgainst,
            proposalId
        );

        IGovPool.Proposal storage proposal = proposals[proposalId];

        proposal.core = IGovPool.ProposalCore({
            settings: settings,
            executed: false,
            voteEnd: uint64(block.timestamp + settings.duration),
            executeAfter: 0,
            votesFor: 0,
            votesAgainst: 0,
            nftPowerSnapshotId: snapshotId
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
            misc,
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
        (, , address govValidators, ) = IGovPool(address(this)).getHelperContracts();

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

        (address govSettingsAddress, address userKeeper, , ) = IGovPool(address(this))
            .getHelperContracts();

        IGovSettings govSettings = IGovSettings(govSettingsAddress);

        address mainExecutor = actionsFor[actionsFor.length - 1].executor;
        settingsId = govSettings.executorToSettings(mainExecutor);

        bool forceDefaultSettings = _handleDataForProposal(settingsId, govSettings, actionsFor);

        if (actionsAgainst.length != 0) {
            forceDefaultSettings =
                _handleDataForProposal(settingsId, govSettings, actionsAgainst) ||
                forceDefaultSettings ||
                settingsId !=
                govSettings.executorToSettings(actionsAgainst[actionsAgainst.length - 1].executor);
        }

        if (forceDefaultSettings) {
            settingsId = uint256(IGovSettings.ExecutorType.DEFAULT);
            settings = govSettings.getDefaultSettings();
        } else {
            settings = govSettings.getExecutorSettings(mainExecutor);
        }

        snapshotId = IGovUserKeeper(userKeeper).createNftPowerSnapshot();
    }

    function _handleDataForDistributionProposal(
        IGovPool.ProposalAction[] calldata actions
    ) internal {
        (uint256 decodedId, address token, uint256 amount) = abi.decode(
            actions[actions.length - 1].data[4:],
            (uint256, address, uint256)
        );

        require(
            decodedId == GovPool(payable(address(this))).latestProposalId(),
            "Gov: invalid proposalId"
        );

        for (uint256 i; i < actions.length - 1; i++) {
            bytes4 selector = actions[i].data.getSelector();

            require(
                actions[i].value == 0 &&
                    (selector == IERC20.approve.selector || selector == IERC20.transfer.selector),
                "Gov: invalid internal data"
            );
        }

        emit DPCreated(decodedId, msg.sender, token, amount);
    }

    function _restrictInterestedUsersFromProposal(
        mapping(address => EnumerableSet.UintSet) storage restrictedProposals,
        IGovPool.ProposalAction[] calldata actionsFor,
        IGovPool.ProposalAction[] calldata actionsAgainst,
        uint256 proposalId
    ) internal {
        _restrictUsersFromActions(restrictedProposals, actionsFor, proposalId);

        if (actionsAgainst.length != 0) {
            _restrictUsersFromActions(restrictedProposals, actionsAgainst, proposalId);
        }
    }

    function _restrictUsersFromActions(
        mapping(address => EnumerableSet.UintSet) storage restrictedProposals,
        IGovPool.ProposalAction[] calldata actions,
        uint256 proposalId
    ) internal {
        (, address expertNft, address dexeExpertNft, ) = IGovPool(address(this)).getNftContracts();

        for (uint256 i; i < actions.length; i++) {
            IGovPool.ProposalAction calldata action = actions[i];
            address executor = actions[i].executor;

            if (executor == expertNft || executor == dexeExpertNft) {
                bytes4 selector = action.data.getSelector();

                if (
                    ((executor == expertNft || executor == dexeExpertNft) &&
                        selector == IERC721Expert.burn.selector) ||
                    (executor == address(this) && selector == IGovPool.undelegateTreasury.selector)
                ) {
                    restrictedProposals[action.data.getFirstArgument()].add(proposalId);
                }
            }
        }
    }

    function _canCreate(
        IGovSettings.ProposalSettings memory settings,
        uint256 snapshotId
    ) internal view {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

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
                        selector == IGovPool.changeVoteModifiers.selector ||
                        selector == IGovPool.setCreditInfo.selector),
                "Gov: invalid internal data"
            );
        }
    }

    function _handleDataForProposal(
        uint256 settingsId,
        IGovSettings govSettings,
        IGovPool.ProposalAction[] calldata actions
    ) internal returns (bool) {
        if (settingsId == uint256(IGovSettings.ExecutorType.INTERNAL)) {
            _handleDataForInternalProposal(govSettings, actions);
            return false;
        }
        if (settingsId == uint256(IGovSettings.ExecutorType.VALIDATORS)) {
            _handleDataForValidatorBalanceProposal(actions);
            return false;
        }
        if (settingsId == uint256(IGovSettings.ExecutorType.DISTRIBUTION)) {
            _handleDataForDistributionProposal(actions);
            return false;
        }
        if (settingsId == uint256(IGovSettings.ExecutorType.DEFAULT)) {
            return false;
        }

        return _handleDataForExistingSettingsProposal(actions);
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

    function _handleDataForExistingSettingsProposal(
        IGovPool.ProposalAction[] calldata actions
    ) internal pure returns (bool) {
        for (uint256 i; i < actions.length - 1; i++) {
            bytes4 selector = actions[i].data.getSelector();

            if (
                actions[i].value != 0 ||
                (selector != IERC20.approve.selector && // same as selector != IERC721.approve.selector
                    selector != IERC721.setApprovalForAll.selector) // same as IERC1155.setApprovalForAll.selector
            ) {
                return true; // should use default settings
            }
        }

        return false;
    }
}
