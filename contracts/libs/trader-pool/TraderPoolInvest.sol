// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/trader/ITraderPool.sol";

import "../../trader/TraderPool.sol";

import "./TraderPoolPrice.sol";
import "./TraderPoolLeverage.sol";
import "../math/MathHelper.sol";

library TraderPoolInvest {
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;
    using TraderPoolPrice for *;
    using TraderPoolLeverage for *;
    using MathHelper for uint256;

    event ActivePortfolioExchanged(
        address fromToken,
        address toToken,
        uint256 fromVolume,
        uint256 toVolume
    );

    function invest(
        ITraderPool.PoolParameters storage poolParameters,
        mapping(address => mapping(uint256 => uint256)) storage investsInBlocks,
        uint256 amountInBaseToInvest,
        uint256[] calldata minPositionsOut
    ) external {
        require(amountInBaseToInvest > 0, "TP: zero investment");
        require(amountInBaseToInvest >= poolParameters.minimalInvestment, "TP: underinvestment");

        TraderPool traderPool = TraderPool(address(this));

        poolParameters.checkLeverage(amountInBaseToInvest);

        uint256 toMintLP = investPositions(
            poolParameters,
            investsInBlocks,
            msg.sender,
            amountInBaseToInvest,
            minPositionsOut
        );

        traderPool.updateTo(msg.sender, toMintLP, amountInBaseToInvest);
        traderPool.mint(msg.sender, toMintLP);
    }

    function investPositions(
        ITraderPool.PoolParameters storage poolParameters,
        mapping(address => mapping(uint256 => uint256)) storage investsInBlocks,
        address baseHolder,
        uint256 amountInBaseToInvest,
        uint256[] calldata minPositionsOut
    ) public returns (uint256 toMintLP) {
        address baseToken = poolParameters.baseToken;
        (
            uint256 totalBase,
            ,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = poolParameters.getNormalizedPoolPriceAndPositions();

        toMintLP = _transferBase(
            poolParameters,
            investsInBlocks,
            baseHolder,
            totalBase,
            amountInBaseToInvest
        );

        for (uint256 i = 0; i < positionTokens.length; i++) {
            uint256 amount = positionPricesInBase[i].ratio(amountInBaseToInvest, totalBase);
            uint256 amountGot = TraderPool(address(this)).priceFeed().normalizedExchangeFromExact(
                baseToken,
                positionTokens[i],
                amount,
                new address[](0),
                minPositionsOut[i]
            );

            emit ActivePortfolioExchanged(baseToken, positionTokens[i], amount, amountGot);
        }
    }

    function _transferBase(
        ITraderPool.PoolParameters storage poolParameters,
        mapping(address => mapping(uint256 => uint256)) storage investsInBlocks,
        address baseHolder,
        uint256 totalBaseInPool,
        uint256 amountInBaseToInvest
    ) internal returns (uint256) {
        TraderPool traderPool = TraderPool(address(this));

        IERC20(poolParameters.baseToken).safeTransferFrom(
            baseHolder,
            address(this),
            amountInBaseToInvest.from18(poolParameters.baseTokenDecimals)
        );

        uint256 toMintLP = amountInBaseToInvest;

        if (totalBaseInPool > 0) {
            toMintLP = toMintLP.ratio(traderPool.totalSupply(), totalBaseInPool);
        }

        require(
            poolParameters.totalLPEmission == 0 ||
                traderPool.totalEmission() + toMintLP <= poolParameters.totalLPEmission,
            "TP: minting > emission"
        );

        investsInBlocks[msg.sender][block.number] += toMintLP;

        return toMintLP;
    }
}
