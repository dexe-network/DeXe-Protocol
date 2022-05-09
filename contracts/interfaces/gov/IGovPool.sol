// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IGovPool {
    /**
     * @notice Execute proposal
     * @param proposalId Proposal ID
     */
    function execute(uint256 proposalId) external;
}
