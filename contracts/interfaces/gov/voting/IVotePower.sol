// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../interfaces/gov/IGovPool.sol";

interface IVotePower {
    /// @notice The function for transforming token and nft power to voting power
    /// @param voter the voter address
    /// @param votes the total token and nft power
    /// @return resultingVotes voting power
    function transformVotes(
        address voter,
        uint256 votes
    ) external view returns (uint256 resultingVotes);

    /// @notice The function for getting ratio of treasury delegated votes
    /// @param voter the address of the voter
    /// @return treasuryRatio the ration with 20 decimals precision
    function getTreasuryRatio(address voter) external view returns (uint256 treasuryRatio);
}
