// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@solarity/solidity-lib/libs/decimals/DecimalsConverter.sol";

import "../../core/Globals.sol";

import "../../interfaces/gov/ERC20/IERC20Gov.sol";

library TokenBalance {
    using DecimalsConverter for *;
    using SafeERC20 for IERC20;
    using Math for uint256;

    enum TransferType {
        Revert,
        TryMint
    }

    function sendFunds(
        address token,
        address receiver,
        uint256 amount,
        TransferType transferType
    ) internal {
        uint256 balance = thisBalance(token);

        require(
            balance >= amount || transferType == TransferType.TryMint,
            "Gov: insufficient funds"
        );

        if (token == ETHEREUM_ADDRESS) {
            (bool status, ) = payable(receiver).call{value: amount.min(balance)}("");

            require(status, "Gov: failed to send eth");
        } else {
            amount = amount.from18(ERC20(token).decimals());

            if (balance < amount) {
                try IERC20Gov(token).mint(address(this), amount - balance) {} catch {
                    amount = balance;
                }
            }

            IERC20(token).safeTransfer(receiver, amount);
        }
    }

    function sendFunds(address token, address receiver, uint256 amount) internal {
        sendFunds(token, receiver, amount, TransferType.Revert);
    }

    function sendFunds(IERC20 token, address receiver, uint256 amount) internal {
        token.safeTransfer(receiver, amount.from18(address(token).decimals()));
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
                : thisBalance(token).to18(token.decimals());
    }
}
