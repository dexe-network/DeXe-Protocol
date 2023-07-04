// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/trader/ITraderPool.sol";

import "../../trader/TraderPool.sol";

import "./TraderPoolCommission.sol";
import "../math/MathHelper.sol";
import "./TraderPoolPrice.sol";
import "../utils/TokenBalance.sol";

library TraderPoolDivest {
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;
    using TraderPoolCommission for *;
    using TraderPoolPrice for *;
    using MathHelper for uint256;
    using TokenBalance for address;

    event ActivePortfolioExchanged(
        address fromToken,
        address toToken,
        uint256 fromVolume,
        uint256 toVolume
    );

    function divest(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 amountLP,
        uint256[] calldata minBaseOut
    ) external {
        TraderPool traderPool = TraderPool(address(this));

        bool senderTrader = traderPool.isTrader(msg.sender);
        require(!senderTrader || traderPool.openPositions().length == 0, "TP: can't divest");

        if (senderTrader) {
            _divestTrader(poolParameters, amountLP);
        } else {
            _divestInvestor(poolParameters, amountLP, minBaseOut);
        }
    }

    function divestPositions(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 amountLP,
        uint256[] calldata minBaseOut
    ) public returns (uint256 investorBaseAmount) {
        _checkUserBalance(amountLP);

        TraderPool traderPool = TraderPool(address(this));
        address baseToken = poolParameters.baseToken;
        uint256 totalSupply = traderPool.totalSupply();

        investorBaseAmount = baseToken.normThisBalance().ratio(amountLP, totalSupply);

        (
            ,
            ,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = poolParameters.getNormalizedPoolPriceAndPositions();

        for (uint256 i = 0; i < positionTokens.length; i++) {
            uint256 amountBase = positionPricesInBase[i].ratio(amountLP, totalSupply);
            require(amountBase >= minBaseOut[i], "TP: slippage");

            uint256 currentPositionBalance = positionTokens[i].normThisBalance().ratio(
                amountLP,
                totalSupply
            );
            uint256 amountPaid = TraderPool(address(this)).priceFeed().normalizedExchangeToExact(
                positionTokens[i],
                baseToken,
                amountBase,
                new address[](0),
                currentPositionBalance
            );

            investorBaseAmount += amountBase;

            emit ActivePortfolioExchanged(positionTokens[i], baseToken, amountPaid, amountBase);
        }
    }

    function _divestInvestor(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 amountLP,
        uint256[] calldata minBaseOut
    ) internal {
        TraderPool traderPool = TraderPool(address(this));

        uint256 investorBaseAmount = divestPositions(poolParameters, amountLP, minBaseOut);
        (uint256 baseCommission, uint256 lpCommission) = poolParameters
            .calculateCommissionOnDivest(msg.sender, investorBaseAmount, amountLP);
        uint256 receivedBase = investorBaseAmount - baseCommission;

        traderPool.updateFrom(msg.sender, amountLP, receivedBase);
        traderPool.burn(msg.sender, amountLP);

        IERC20(poolParameters.baseToken).safeTransfer(
            msg.sender,
            receivedBase.from18(poolParameters.baseTokenDecimals)
        );

        if (baseCommission > 0) {
            poolParameters.distributeCommission(baseCommission, lpCommission);
        }
    }

    function _divestTrader(
        ITraderPool.PoolParameters storage poolParameters,
        uint256 amountLP
    ) internal {
        _checkUserBalance(amountLP);

        TraderPool traderPool = TraderPool(address(this));

        IERC20 baseToken = IERC20(poolParameters.baseToken);
        uint256 receivedBase = address(baseToken).normThisBalance().ratio(
            amountLP,
            traderPool.totalSupply()
        );

        traderPool.updateFrom(msg.sender, amountLP, receivedBase);
        traderPool.burn(msg.sender, amountLP);

        baseToken.safeTransfer(msg.sender, receivedBase.from18(poolParameters.baseTokenDecimals));
    }

    function _checkUserBalance(uint256 amountLP) internal view {
        TraderPool traderPool = TraderPool(address(this));

        require(block.number > traderPool.latestInvestBlocks(msg.sender), "TP: wrong block");
        require(amountLP <= traderPool.balanceOf(msg.sender), "TP: wrong amount");
    }
}
