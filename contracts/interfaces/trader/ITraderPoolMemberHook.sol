// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is an interface that is used in the proposals to add new members upon token transfers
 */
interface ITraderPoolMemberHook {
    /// @notice The callback function that is called from _beforeTokenTransfer hook in the proposal contract.
    /// Needed to maintain the pool members
    /// @param user the transferrer of the funds
    function checkLeave(address user) external;

    /// @notice The callback function that is called from _beforeTokenTransfer hook in the proposal contract.
    /// Needed to maintain the pool members
    /// @param user the receiver of the funds
    function checkJoin(address user) external;
}
