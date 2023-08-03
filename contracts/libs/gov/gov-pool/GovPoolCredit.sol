// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../interfaces/gov/IGovPool.sol";

library GovPoolCredit {
    function updateCreditInfo(
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
            info[i] = IGovPool.CreditInfoView({
                token: currentToken,
                monthLimit: tokenInfo[currentToken].monthLimit,
                currentWithdrawLimit: _getCreditBalanceForToken(tokenInfo, currentToken)
            });
        }
    }

    function _getCreditBalanceForToken(
        mapping(address => IGovPool.TokenCreditInfo) storage tokenInfo,
        address token
    ) internal view returns (uint256 amountWithdrawn) {
        uint timestampMonthAgo = block.timestamp - 30 days;
        IGovPool.WithdrawalHistory[] storage history = tokenInfo[token].withdraws;
        uint historyLength = history.length;
        uint counter;
        for (counter = 0; counter < historyLength; counter++) {
            if (history[counter].timestamp > timestampMonthAgo) {
                break;
            }
        }
        while (counter < historyLength) {
            amountWithdrawn += history[counter].amount;
            counter++;
        }
    }
}
