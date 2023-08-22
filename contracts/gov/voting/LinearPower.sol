// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../../interfaces/gov/voting/IVotePower.sol";

/// @dev has to ownable for compatibility reasons
contract LinearPower is IVotePower, OwnableUpgradeable {
    function __LinearPower_init() external initializer {
        __Ownable_init();
    }

    function transformVotes(
        address,
        uint256 votes
    ) external pure override returns (uint256 resultingVotes) {
        return votes;
    }
}
