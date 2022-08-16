// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./settings/IGovSettings.sol";

/**
 * This contract is responsible for the creation of new proposals (part of the pool)
 */
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
        string descriptionURL;
        address[] executors;
        uint256[] values;
        bytes[] data;
        bool validatorsVote;
    }

    /// @notice Create proposal
    /// @notice For internal proposal, last executor should be `GovSetting` contract
    /// @notice For typed proposal, last executor should be typed contract
    /// @notice For external proposal, any configuration of addresses and bytes
    /// @param descriptionURL IPFS url to the proposal's description
    /// @param executors Executors addresses
    /// @param values the ether values
    /// @param data data Bytes
    function createProposal(
        string calldata descriptionURL,
        address[] memory executors,
        uint256[] calldata values,
        bytes[] calldata data,
        bool validatorsVote
    ) external;

    /// @param proposalId Proposal ID
    /// @return Executor addresses
    /// @return Data for each address
    function getProposalInfo(uint256 proposalId)
        external
        view
        returns (address[] memory, bytes[] memory);
}
