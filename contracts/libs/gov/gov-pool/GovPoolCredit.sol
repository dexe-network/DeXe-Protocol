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
            uint256 tokenCredit = _getCreditBalanceForToken(creditInfo, currentToken);
            require(
                currentAmount <= tokenCredit,
                "GPC: Current credit permission < amount to withdraw"
            );
            IERC20(currentToken).safeTransfer(destination, currentAmount);
            creditInfo.tokenInfo[currentToken].timestamps.push(block.timestamp);
            uint256 historyLength = creditInfo.tokenInfo[currentToken].cumulativeAmounts.length;
            if (historyLength == 0) {
                creditInfo.tokenInfo[currentToken].cumulativeAmounts.push(currentAmount);
            } else {
                creditInfo.tokenInfo[currentToken].cumulativeAmounts.push(
                    currentAmount +
                        creditInfo.tokenInfo[currentToken].cumulativeAmounts[historyLength - 1]
                );
            }
        }
    }

    function _getCreditBalanceForToken(
        IGovPool.CreditInfo storage creditInfo,
        address token
    ) internal view returns (uint256) {
        IGovPool.TokenCreditInfo storage tokenInfo = creditInfo.tokenInfo[token];
        uint256[] storage amounts = tokenInfo.cumulativeAmounts;
        uint256[] storage timestamps = tokenInfo.timestamps;
        uint256 historyLength = amounts.length;

        int256 timestampMonthAgo = int256(block.timestamp) - 30 days;
        uint256 index = _upperBound(timestamps, timestampMonthAgo);
        uint amountWithdrawn;
        if (index == historyLength) {
            return tokenInfo.monthLimit;
        } else {
            amountWithdrawn = index == 0
                ? amounts[historyLength - 1]
                : amounts[historyLength - 1] - amounts[index - 1];
            return
                amountWithdrawn >= tokenInfo.monthLimit
                    ? 0
                    : tokenInfo.monthLimit - amountWithdrawn;
        }
    }

    function _upperBound(
        uint256[] storage array_,
        int256 element_
    ) internal view returns (uint256 index_) {
        (uint256 low_, uint256 high_) = (0, array_.length);

        while (low_ < high_) {
            uint256 mid_ = (low_ + high_) / 2;

            if (int(array_[mid_]) > element_) {
                high_ = mid_;
            } else {
                low_ = mid_ + 1;
            }
        }

        return high_;
    }
}
