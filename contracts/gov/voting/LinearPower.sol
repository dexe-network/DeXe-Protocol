// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../interfaces/gov/IGovPool.sol";
import "../../interfaces/gov/user-keeper/IGovUserKeeper.sol";
import "../../interfaces/gov/voting/IVotePower.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/math/LogExpMath.sol";

import "../../core/Globals.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract LinearPower is IVotePower, OwnableUpgradeable {
    using MathHelper for uint256;
    using LogExpMath for uint256;

    function __LinearPower_init() external {
        __Ownable_init();
    }

    function transformVotes(
        address voter,
        IGovPool.VoteType voteType,
        uint256 votes
    ) external view returns (uint256 resultingVotes) {
        return votes;
    }
}
