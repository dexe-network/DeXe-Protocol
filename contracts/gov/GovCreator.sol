// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "../interfaces/gov/IGovCreator.sol";
import "../interfaces/gov/settings/IGovSettings.sol";
import "../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../interfaces/gov/validators/IGovValidators.sol";

abstract contract GovCreator is IGovCreator {
    IGovSettings public govSetting;
    IGovUserKeeper public govUserKeeper;
    IGovValidators public govValidators;

    address public distributionProposal;

    uint256 private _latestProposalId;

    mapping(uint256 => Proposal) public proposals; // proposalId => info

    function __GovCreator_init(
        address govSettingAddress,
        address govUserKeeperAddress,
        address distributionProposalAddress,
        address validatorsAddress
    ) internal {
        require(govSettingAddress != address(0), "GovC: address is zero (1)");
        require(govUserKeeperAddress != address(0), "GovC: address is zero (2)");

        govSetting = IGovSettings(govSettingAddress);
        govUserKeeper = IGovUserKeeper(govUserKeeperAddress);
        govValidators = IGovValidators(validatorsAddress);

        distributionProposal = distributionProposalAddress;
    }

    function createProposal(
        string calldata descriptionURL,
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
            _handleDataForChangeValidatorBalanceProposal(executors, values, data);
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
            descriptionURL: descriptionURL,
            executors: executors,
            values: values,
            data: data
        });
    }

    function getProposalInfo(uint256 proposalId)
        external
        view
        override
        returns (address[] memory, bytes[] memory)
    {
        return (proposals[proposalId].executors, proposals[proposalId].data);
    }

    function _handleExecutorsAndDataForInternalProposal(
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) private pure {
        for (uint256 i; i < data.length; i++) {
            bytes4 selector = _getSelector(data[i]);
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
            bytes4 selector = _getSelector(data[i]);

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
            bytes4 selector = _getSelector(data[i]);

            require(
                values[i] == 0 &&
                    (selector == IERC20.approve.selector ||
                        selector == IERC20.transfer.selector ||
                        selector == IERC20.transferFrom.selector),
                "GovC: invalid internal data"
            );
        }
    }

    function _handleDataForChangeValidatorBalanceProposal(
        address[] calldata executors,
        uint256[] calldata values,
        bytes[] calldata data
    ) private pure {
        for (uint256 i; i < data.length; i++) {
            bytes4 selector = _getSelector(data[i]);
            require(
                values[i] == 0 &&
                    executors[executors.length - 1] == executors[i] &&
                    (selector == IGovValidators.changeBalances.selector),
                "GovC: invalid internal data"
            );
        }
    }

    function _getSelector(bytes calldata data) private pure returns (bytes4 selector) {
        assembly {
            selector := calldataload(data.offset)
        }
    }
}
