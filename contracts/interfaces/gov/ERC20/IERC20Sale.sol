// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * DAO pools could issue their own ERC20 token and sell it to investors with custom sale logic
 */
interface IERC20Sale {
    /// @notice Initial ERC20Sale parameters. This struct is used as an input argument in the contract constructor
    /// @param name the name of the token
    /// @param symbol the symbol of the token
    /// @param users the list of users for which tokens need to be minted
    /// @param saleAmount the token amount to be minted for sale
    /// @param cap cap on the token's total supply
    /// @param mintedTotal the total amount of tokens to be minted while the contract creation
    /// @param amounts the list of token amounts which should be minted to the respective users
    struct ConstructorParams {
        string name;
        string symbol;
        address[] users;
        uint256 saleAmount;
        uint256 cap;
        uint256 mintedTotal;
        uint256[] amounts;
    }

    /// @notice This function is used to mint tokens
    /// @param account the address to which tokens should be minted
    /// @param the token amount to be minted
    function mint(address account, uint256 amount) external;

    /// @notice This function is used to burn tokens
    /// @param account the address from which tokens should be burned
    /// @param the token amount to be burned
    function burn(address account, uint256 amount) external;

    /// @notice This function is used to trigger stopped contract state
    function pause() external;

    /// @notice This function is used to return default contract state
    function unpause() external;
}
