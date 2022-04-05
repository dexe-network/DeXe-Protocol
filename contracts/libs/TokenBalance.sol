// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./DecimalsConverter.sol";

library TokenBalance {
    using DecimalsConverter for uint256;

    function normThisBalance(address token) internal view returns (uint256) {
        return IERC20(token).balanceOf(address(this)).convertTo18(ERC20(token).decimals());
    }

    function thisBalance(address token) internal view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
