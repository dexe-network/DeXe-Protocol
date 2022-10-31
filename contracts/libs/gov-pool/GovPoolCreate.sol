// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../interfaces/gov/settings/IGovSettings.sol";
import "../../interfaces/gov/validators/IGovValidators.sol";

import "../utils/DataHelper.sol";

import "../../gov/GovPool.sol";

library GovPoolCreate {
    using DataHelper for bytes;

    event ProposalCreated(
        uint256 proposalId,
        string proposalDescription,
        uint256 quorum,
        uint256 proposalSettings,
        address sender
    );
    event DPCreated(uint256 proposalId, address sender, address token, uint256 amount);

    function createProposal(
        mapping(uint256 => IGovPool.Proposal) storage proposals,
        string calldata _descriptionURL,
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) external {
        require(
            executors.length > 0 &&
                executors.length == values.length &&
                executors.length == data.length,
            "Gov: invalid array length"
        );

        (
            IGovSettings.ProposalSettings memory settings,
            uint256 settingsId,
            uint256 snapshotId
        ) = _validateProposal(executors, values, data);

        uint256 proposalId = GovPool(payable(address(this))).latestProposalId();

        proposals[proposalId] = IGovPool.Proposal({
            core: IGovPool.ProposalCore({
                settings: settings,
                executed: false,
                voteEnd: uint64(block.timestamp + settings.duration),
                votesFor: 0,
                nftPowerSnapshotId: snapshotId
            }),
            descriptionURL: _descriptionURL,
            executors: executors,
            values: values,
            data: data
        });

        _canParticipate(settings, snapshotId);

        emit ProposalCreated(proposalId, _descriptionURL, settings.quorum, settingsId, msg.sender);
    }

    function _canParticipate(IGovSettings.ProposalSettings memory settings, uint256 snapshotId)
        internal
        view
    {
        (, address userKeeper, , ) = IGovPool(address(this)).getHelperContracts();

        require(
            IGovUserKeeper(userKeeper).canParticipate(
                msg.sender,
                false,
                !settings.delegatedVotingAllowed,
                settings.minVotesForCreating,
                snapshotId
            ),
            "Gov: low voting power"
        );
    }

    function _validateProposal(
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    )
        internal
        returns (
            IGovSettings.ProposalSettings memory settings,
            uint256 settingsId,
            uint256 snapshotId
        )
    {
        (address govSettings, address userKeeper, , ) = IGovPool(address(this))
            .getHelperContracts();

        address mainExecutor = executors[executors.length - 1];
        settingsId = IGovSettings(govSettings).executorToSettings(mainExecutor);

        bool forceDefaultSettings;

        if (settingsId == uint256(IGovSettings.ExecutorType.INTERNAL)) {
            _handleDataForInternalProposal(govSettings, executors, values, data);
        } else if (settingsId == uint256(IGovSettings.ExecutorType.VALIDATORS)) {
            _handleDataForValidatorBalanceProposal(executors, values, data);
        } else if (settingsId == uint256(IGovSettings.ExecutorType.DISTRIBUTION)) {
            _handleDataForDistributionProposal(values, data);
        } else if (settingsId != uint256(IGovSettings.ExecutorType.DEFAULT)) {
            forceDefaultSettings = _handleDataForExistingSettingsProposal(values, data);
        }

        if (forceDefaultSettings) {
            settingsId = uint256(IGovSettings.ExecutorType.DEFAULT);
            settings = IGovSettings(govSettings).getDefaultSettings();
        } else {
            settings = IGovSettings(govSettings).getSettings(mainExecutor);
        }

        snapshotId = IGovUserKeeper(userKeeper).createNftPowerSnapshot();
    }

    function _handleDataForInternalProposal(
        address govSettings,
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) internal view {
        for (uint256 i; i < data.length; i++) {
            bytes4 selector = data[i].getSelector();
            uint256 executorSettings = IGovSettings(govSettings).executorToSettings(executors[i]);

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

        require(
            decodedId == GovPool(payable(address(this))).latestProposalId(),
            "Gov: invalid proposalId"
        );

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
}
