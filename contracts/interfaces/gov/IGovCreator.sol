// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./settings/IGovSettings.sol";

/// @title GovCreator contract responsible for the creation of new proposals
interface IGovCreator {
    struct ProposalCore {
        IGovSettings.ProposalSettings settings;
        bool executed;
        uint64 voteEnd;
        uint256 votesFor;
        uint256 nftPowerSnapshotId;
        uint256 proposalId;
    }

    struct Proposal {
        ProposalCore core;
        address[] executors;
        bytes[] data;
    }

    /**
     * @notice Create proposal
     * @notice For internal proposal, last executor should be `GovSetting` contract
     * @notice For typed proposal, last executor should be typed contract
     * @notice For external proposal, any configuration of addresses and bytes
     * @param executors Executors addresses
     * @param data data Bytes
     */
    function createProposal(address[] memory executors, bytes[] calldata data) external;

    /**
     * @param proposalId Proposal ID
     * @return Executor addresses
     * @return Data for each address
     */
    function getProposalInfo(uint256 proposalId)
        external
        view
        returns (address[] memory, bytes[] memory);
}
