// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract GovPoolMock {
    uint256 public userActiveProposalsCount;

    function getUserActiveProposalsCount(address) external view returns (uint256) {
        return userActiveProposalsCount;
    }

    function setUserActiveProposalsCount(uint256 _userActiveProposalsCount) external {
        userActiveProposalsCount = _userActiveProposalsCount;
    }
}
