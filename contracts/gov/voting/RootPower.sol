// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/voting/IVotePower.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/math/LogExpMath.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract RootPower is IVotePower, OwnableUpgradeable {
    using MathHelper for uint256;
    using LogExpMath for uint256;

    uint256 internal _regularVoteModifier;
    uint256 internal _expertVoteModifier;

    function __RootPower_init() external {}

    function transformVotes(
        address voter,
        uint256 votes
    ) external view returns (uint256 resultingVotes) {
        IGovPool govPool = IGovPool(owner());
        bool expertStatus = govPool.getExpertStatus(voter);
        uint256 coefficient = expertStatus ? _expertVoteModifier : _regularVoteModifier;
        resultingVotes = votes;
    }
}
