// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";

import "../interfaces/gov/IGovPool.sol";

import "./GovUserKeeperController.sol";

contract GovPool is
    IGovPool,
    GovUserKeeperController,
    ERC721HolderUpgradeable,
    ERC1155HolderUpgradeable
{
    string public descriptionURL;

    function __GovPool_init(
        address govSettingAddress,
        address govUserKeeperAddress,
        address validatorsAddress,
        uint256 _votesLimit,
        uint256 _feePercentage,
        string calldata _descriptionURL
    ) external initializer {
        __GovCreator_init(govSettingAddress, govUserKeeperAddress);
        __GovVote_init(validatorsAddress, _votesLimit);
        __GovFee_init(_feePercentage);
        __ERC721Holder_init();
        __ERC1155Holder_init();

        descriptionURL = _descriptionURL;
    }

    function execute(uint256 proposalId) external override {
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
                revert(_getRevertMsg(returnedData));
            }
        }
    }

    receive() external payable {}

    function _getRevertMsg(bytes memory data) internal pure returns (string memory) {
        if (data.length < 68) {
            return "Transaction reverted silently";
        }

        assembly {
            data := add(data, 0x04)
        }

        return abi.decode(data, (string));
    }
}
