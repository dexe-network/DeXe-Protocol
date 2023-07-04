// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../core/Globals.sol";

import "../../interfaces/gov/ERC20/IERC20Sale.sol";

library TokenBalance {
    using DecimalsConverter for uint256;
    using SafeERC20 for IERC20;

    function sendFunds(
        address token,
        address receiver,
        uint256 amount,
        bool mintIfNotEnough
    ) internal {
        if (token == ETHEREUM_ADDRESS) {
            (bool status, ) = payable(receiver).call{value: amount}("");

            require(status, "Gov: failed to send eth");
        } else {
            amount = amount.from18(ERC20(token).decimals());

            if (mintIfNotEnough) {
                uint256 balance = IERC20(token).balanceOf(address(this));

                if (balance < amount) {
                    try IERC20Sale(token).mint(address(this), amount - balance) {} catch {}
                }
            }

            IERC20(token).safeTransfer(receiver, amount);
        }
    }

    function sendFunds(address token, address receiver, uint256 amount) internal {
        sendFunds(token, receiver, amount, false);
    }

    function thisBalance(address token) internal view returns (uint256) {
        return
            token == ETHEREUM_ADDRESS
                ? address(this).balance
                : IERC20(token).balanceOf(address(this));
    }

    function normThisBalance(address token) internal view returns (uint256) {
        return
            token == ETHEREUM_ADDRESS
                ? thisBalance(token)
                : thisBalance(token).to18(ERC20(token).decimals());
    }
}
