// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IValidatorsToken is IERC20 {
    /**
     * @notice Mint new tokens, available only from `Validators` contract
     * @param account Address
     * @param amount Token amount to mint. Wei
     */
    function mint(address account, uint256 amount) external;

    /**
     * @notice Burn tokens, available only from `Validators` contract
     * @param account Address
     * @param amount Token amount to burn. Wei
     */
    function burn(address account, uint256 amount) external;

    /**
     * @notice Create tokens snapshot
     * @return Snapshot ID
     */
    function snapshot() external returns (uint256);
}
