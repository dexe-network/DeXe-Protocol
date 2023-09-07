// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../../interfaces/gov/voting/IVotePower.sol";

contract VotePowerMock is IVotePower, OwnableUpgradeable {
    uint256 private _power;

    function __VotePower_init() external initializer {
        __Ownable_init();
    }

    function setPower(uint256 power) external {
        _power = power;
    }

    function transformVotes(
        address,
        uint256 votes
    ) external view override returns (uint256 resultingVotes) {
        if (_power == 0) {
            return votes;
        }

        return votes * votes;
    }
}
