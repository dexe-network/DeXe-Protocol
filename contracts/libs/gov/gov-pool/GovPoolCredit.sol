// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../../interfaces/gov/IGovPool.sol";

library GovPoolCredit {
    using SafeERC20 for IERC20;

    function setCreditInfo(
        IGovPool.CreditInfo storage creditInfo,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external {
        require(
            tokens.length == amounts.length,
            "GPC: Number of tokens and amounts are not equal"
        );
        for (uint256 i = 0; i < creditInfo.tokenList.length; i++) {
            address currentToken = creditInfo.tokenList[i];
            creditInfo.tokenInfo[currentToken].monthLimit = 0;
        }
        creditInfo.tokenList = tokens;
        for (uint256 i = 0; i < tokens.length; i++) {
            address currentToken = tokens[i];
            require(currentToken != address(0), "GPC: Token address could not be zero");
            // More constrains on token???????
            creditInfo.tokenInfo[currentToken].monthLimit = amounts[i];
        }
    }

    function getCreditInfo(
        IGovPool.CreditInfo storage creditInfo
    ) external view returns (IGovPool.CreditInfoView[] memory info) {
        uint256 infoLength = creditInfo.tokenList.length;
        info = new IGovPool.CreditInfoView[](infoLength);
        mapping(address => IGovPool.TokenCreditInfo) storage tokenInfo = creditInfo.tokenInfo;
        for (uint i = 0; i < infoLength; i++) {
            address currentToken = creditInfo.tokenList[i];
            uint256 monthLimit = tokenInfo[currentToken].monthLimit;
            info[i] = IGovPool.CreditInfoView({
                token: currentToken,
                monthLimit: monthLimit,
                currentWithdrawLimit: _getCreditBalanceForToken(creditInfo, currentToken)
            });
        }
    }

    function transferCreditAmount(
        IGovPool.CreditInfo storage creditInfo,
        address[] memory tokens,
        uint256[] memory amounts,
        address destination
    ) external {
        uint tokensLength = tokens.length;
        require(amounts.length == tokensLength, "GPC: Number of tokens and amounts are not equal");
        for (uint i = 0; i < tokensLength; i++) {
            address currentToken = tokens[i];
            uint currentAmount = amounts[i];
            _cleanWithdrawalHistory(creditInfo, currentToken);
            uint256 tokenCredit = _getCreditBalanceForToken(creditInfo, currentToken);
            require(
                currentAmount <= tokenCredit,
                "GPC: Current credit permission < amount to withdraw"
            );
            IERC20(currentToken).safeTransfer(destination, currentAmount);
            creditInfo.tokenInfo[currentToken].amounts.push(currentAmount);
            creditInfo.tokenInfo[currentToken].timestamps.push(block.timestamp);
        }
    }

    function _cleanWithdrawalHistory(
        IGovPool.CreditInfo storage creditInfo,
        address token
    ) internal {
        uint[] storage amounts = creditInfo.tokenInfo[token].amounts;
        uint[] storage timestamps = creditInfo.tokenInfo[token].timestamps;
        uint256 historyLength = amounts.length;
        uint256 counter;
        for (counter = 0; counter < historyLength; counter++) {
            if (timestamps[counter] + 30 days > block.timestamp) {
                break;
            }
        }
        if (counter == 0) return;

        uint[] memory newAmounts = new uint[](historyLength - counter);
        uint[] memory newTimestamps = new uint[](historyLength - counter);
        uint256 newCounter = 0;
        while (counter < historyLength) {
            newAmounts[newCounter] = amounts[counter];
            newTimestamps[newCounter] = timestamps[counter];
            counter++;
            newCounter++;
        }
        creditInfo.tokenInfo[token].amounts = newAmounts;
        creditInfo.tokenInfo[token].timestamps = newTimestamps;
    }

    function _getCreditBalanceForToken(
        IGovPool.CreditInfo storage creditInfo,
        address token
    ) internal view returns (uint256 available) {
        IGovPool.TokenCreditInfo storage tokenInfo = creditInfo.tokenInfo[token];
        uint256[] storage amounts = tokenInfo.amounts;
        uint256[] storage timestamps = tokenInfo.timestamps;
        uint historyLength = amounts.length;
        uint counter;
        for (counter = 0; counter < historyLength; counter++) {
            if (timestamps[counter] + 30 days > block.timestamp) {
                break;
            }
        }
        uint256 amountWithdrawn;
        while (counter < historyLength) {
            amountWithdrawn += amounts[counter];
            counter++;
        }
        available = amountWithdrawn >= tokenInfo.monthLimit
            ? 0
            : tokenInfo.monthLimit - amountWithdrawn;
    }
}
