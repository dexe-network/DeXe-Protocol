// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * DAO pools could issue their own ERC20 token and sell it to investors with custom sale logic
 */
interface IERC20Sale {
    /// @notice Initial ERC20Sale parameters. This struct is used as an input argument in the contract constructor
    /// @param name the name of the token
    /// @param symbol the symbol of the token
    /// @param users the list of users for which tokens are needed to be minted
    /// @param saleAmount the token amount to be minted for sale
    /// @param cap cap on the token's total supply
    /// @param mintedTotal the total amount of tokens to be minted with the contract creation
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

    /// @notice The function to initialize the contract
    /// @param _govAddress the address of the governance contract
    /// @param _saleAddress the address of the sale contract
    /// @param params the initial parameters of the contract
    function __ERC20Sale_init(
        address _govAddress,
        address _saleAddress,
        ConstructorParams calldata params
    ) external;

    /// @notice This function is used to mint tokens
    /// @param account the address to which tokens should be minted
    /// @param amount the token amount to be minted
    function mint(address account, uint256 amount) external;

    /// @notice This function is used to trigger stopped contract state
    function pause() external;

    /// @notice This function is used to return default contract state
    function unpause() external;

    /// @notice This function is used to blacklist the addresses
    /// @param accounts the addresses to be blacklisted
    /// @param value the blacklist status
    function blacklist(address[] calldata accounts, bool value) external;

    /// @notice This function is used to get the address of the governance contract
    /// @return the address of the governance contract
    function govAddress() external view returns (address);

    /// @notice This function is used to get the total amount of blacklisted accounts
    function totalBlacklistAccounts() external view returns (uint256);

    /// @notice The paginated function to get addresses of blacklisted accounts
    /// @param offset the starting index of the accounts array
    /// @param limit the length of the array to observe
    /// @return requested blacklist array
    function getBlacklistAccounts(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory);
}
