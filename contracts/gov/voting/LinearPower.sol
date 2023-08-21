// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../interfaces/gov/voting/IVotePower.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract LinearPower is IVotePower, OwnableUpgradeable {
    function __LinearPower_init() external initializer {
        __Ownable_init();
    }

    function transformVotes(
        address voter,
        uint256 votes
    ) external view returns (uint256 resultingVotes) {
        return votes;
    }
}
