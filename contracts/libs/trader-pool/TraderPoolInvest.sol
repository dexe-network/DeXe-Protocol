// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/trader/ITraderPool.sol";

import "../../trader/TraderPool.sol";

import "./TraderPoolPrice.sol";
import "./TraderPoolLeverage.sol";
import "../math/MathHelper.sol";

library TraderPoolInvest {
    using SafeERC20 for IERC20Metadata;
    using DecimalsConverter for uint256;
    using TraderPoolPrice for *;
    using TraderPoolLeverage for *;
    using MathHelper for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    event ActivePortfolioExchanged(
        address fromToken,
        address toToken,
        uint256 fromVolume,
        uint256 toVolume
    );

    event Exchanged(
        address sender,
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

    function investTokens(
        ITraderPool.PoolParameters storage poolParameters,
        mapping(address => mapping(uint256 => uint256)) storage investsInBlocks,
        EnumerableSet.AddressSet storage positions,
        uint256[] calldata amounts,
        address[] calldata tokens
    ) external returns (uint256 toMintLP) {
        address baseToken = poolParameters.baseToken;

        TraderPool traderPool = TraderPool(address(this));

        (uint256 totalBase, , , ) = poolParameters.getNormalizedPoolPriceAndPositions();

        for (uint256 i; i < tokens.length; i++) {
            require(
                !traderPool.coreProperties().isBlacklistedToken(tokens[i]),
                "TP: token in blacklist"
            );
            uint256 baseAmount;
            IERC20Metadata(tokens[i]).safeTransferFrom(
                msg.sender,
                address(this),
                amounts[i].to18(IERC20Metadata(tokens[i]).decimals())
            );

            if (tokens[i] != baseToken) {
                (baseAmount, ) = traderPool.priceFeed().getNormalizedPriceOut(
                    tokens[i],
                    baseToken,
                    amounts[i]
                );

                if (positions.contains(tokens[i])) {
                    emit ActivePortfolioExchanged(baseToken, tokens[i], baseAmount, amounts[i]);
                } else {
                    positions.add(tokens[i]);
                    emit Exchanged(msg.sender, baseToken, tokens[i], baseAmount, amounts[i]);
                }
            } else {
                baseAmount = amounts[i];
            }

            toMintLP += _calculateToMintLP(poolParameters, investsInBlocks, totalBase, baseAmount);
        }

        traderPool.updateTo(msg.sender, toMintLP, toMintLP);
        traderPool.mint(msg.sender, toMintLP);
    }

    function _transferBase(
        ITraderPool.PoolParameters storage poolParameters,
        mapping(address => mapping(uint256 => uint256)) storage investsInBlocks,
        address baseHolder,
        uint256 totalBaseInPool,
        uint256 amountInBaseToInvest
    ) internal returns (uint256) {
        IERC20Metadata(poolParameters.baseToken).safeTransferFrom(
            baseHolder,
            address(this),
            amountInBaseToInvest.from18(poolParameters.baseTokenDecimals)
        );

        return
            _calculateToMintLP(
                poolParameters,
                investsInBlocks,
                totalBaseInPool,
                amountInBaseToInvest
            );
    }

    function _calculateToMintLP(
        ITraderPool.PoolParameters storage poolParameters,
        mapping(address => mapping(uint256 => uint256)) storage investsInBlocks,
        uint256 totalBaseInPool,
        uint256 amountInBaseToInvest
    ) internal returns (uint256) {
        TraderPool traderPool = TraderPool(address(this));
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
