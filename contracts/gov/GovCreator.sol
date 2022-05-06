// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "../interfaces/gov/settings/IGovSettings.sol";
import "../interfaces/gov/IGovUserKeeper.sol";
import "../interfaces/gov/IGovCreator.sol";

abstract contract GovCreator is IGovCreator {
    IGovSettings public govSetting;
    IGovUserKeeper public govUserKeeper;

    uint256 private _latestProposalId;

    mapping(uint256 => Proposal) public proposals; // proposalId => info

    event ProposalCreated(uint256 id);

    function __GovCreator_init(address govSettingAddress, address govUserKeeperAddress) internal {
        require(govSettingAddress != address(0), "GovC: address is zero (1)");
        require(govUserKeeperAddress != address(0), "GovC: address is zero (2)");

        govSetting = IGovSettings(govSettingAddress);
        govUserKeeper = IGovUserKeeper(govUserKeeperAddress);
    }

    function createProposal(address[] memory executors, bytes[] calldata data) external override {
        require(
            executors.length > 0 && executors.length == data.length,
            "GovC: invalid array length"
        );
        require(govUserKeeper.canUserParticipate(msg.sender, 1, 1), "GovC: low balance");

        uint256 proposalId = ++_latestProposalId;

        address mainExecutor = executors[executors.length - 1];
        (, bool isInternal, bool settingsExist) = govSetting.executorInfo(mainExecutor);

        if (isInternal) {
            executors = _handleExecutorsAndDataForInternalProposal(executors, data);
        } else if (settingsExist) {
            _handleDataForExistingSettingsProposal(data);
        }

        IGovSettings.ProposalSettings memory settings = govSetting.getSettings(mainExecutor);

        proposals[proposalId] = Proposal({
            core: ProposalCore({
                settings: settings,
                executed: false,
                voteEnd: uint64(block.timestamp + settings.duration),
                votesFor: 0,
                nftPowerSnapshotId: govUserKeeper.createNftPowerSnapshot(),
                proposalId: proposalId
            }),
            executors: executors,
            data: data
        });

        emit ProposalCreated(proposalId);
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
        address[] memory executors,
        bytes[] calldata data
    ) private pure returns (address[] memory) {
        address mainExecutor = executors[executors.length - 1];

        for (uint256 i; i < data.length; i++) {
            bytes4 selector = _getSelector(data[i]);
            require(
                selector == IGovSettings.addSettings.selector ||
                    selector == IGovSettings.editSettings.selector ||
                    selector == IGovSettings.changeExecutors.selector,
                "GovC: invalid data (1)"
            );

            executors[i] = mainExecutor;
        }

        return executors;
    }

    function _handleDataForExistingSettingsProposal(bytes[] calldata data) private pure {
        for (uint256 i; i < data.length - 1; i++) {
            bytes4 selector = _getSelector(data[i]);
            require(
                selector == IERC20.approve.selector ||
                    selector == IERC721.approve.selector ||
                    selector == IERC1155.setApprovalForAll.selector,
                "GovC: invalid data (2)"
            );
        }
    }

    function _getSelector(bytes calldata data) private pure returns (bytes4 selector) {
        assembly {
            selector := calldataload(data.offset)
        }
    }
}
