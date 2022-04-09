// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * This is an interface that is used in the proposals to add new investors upon token transfers
 */
interface ITraderPoolInvestorsHook {
    /// @notice The callback function that is called from _beforeTokenTransfer hook in the proposal contract.
    /// Needed to maintain the total investors amount
    /// @param user the transferrer of the funds
    function checkRemoveInvestor(address user) external;

    /// @notice The callback function that is called from _beforeTokenTransfer hook in the proposal contract.
    /// Needed to maintain the total investors amount
    /// @param user the receiver of the funds
    function checkNewInvestor(address user) external;
}
