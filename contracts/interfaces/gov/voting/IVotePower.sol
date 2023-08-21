// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../interfaces/gov/IGovPool.sol";

interface IVotePower {
    function transformVotes(
        address voter,
        IGovPool.VoteType voteType,
        uint256 votes
    ) external view returns (uint256 resultingVotes);
}
