// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface INetworkProperties {
    /// @notice Used in native coin governance mechanism
    /// @return The current full supply of native coin
    function getNativeSupply() external view returns (uint256);
}
