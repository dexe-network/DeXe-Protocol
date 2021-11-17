// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/Address.sol";

import "../interfaces/trader/IBasicTraderPool.sol";
import "../interfaces/trader/ITraderPoolProposal.sol";

import "./TraderPool.sol";

contract BasicTraderPool is IBasicTraderPool, TraderPool {
    using Address for address;
    using TraderPoolHelper for PoolParameters;
    using MathHelper for uint256;

    ITraderPoolProposal internal _traderPoolProposal;

    function __BasicTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters,
        address traderPoolProposal
    ) public override {
        TraderPool.__TraderPool_init(name, symbol, _poolParameters);

        _traderPoolProposal = ITraderPoolProposal(traderPoolProposal);
    }

    function _totalEmission() internal view override returns (uint256) {
        return totalSupply() + _traderPoolProposal.totalLockedLP();
    }

    function _leveragePoolPriceInDAI()
        internal
        view
        override
        returns (uint256 totalInDAI, uint256 traderInDAI)
    {
        (totalInDAI, ) = poolParameters.getPoolPriceInDAI(_openPositions, _priceFeed);
        totalInDAI += _priceFeed.getNormalizedPriceInDAI(
            poolParameters.baseToken,
            _traderPoolProposal.totalInvestedBase()
        );

        address trader = poolParameters.trader;

        traderInDAI = totalInDAI.ratio(
            balanceOf(trader) + _traderPoolProposal.totalLPInvestments(trader),
            _totalEmission()
        );
    }

    function exchange(
        address from,
        address to,
        uint256 amount
    ) public override onlyTraderAdmin {
        require(_priceFeed.isSupportedBaseToken(to), "BTP: invalid exchange");

        super.exchange(from, to, amount);
    }

    function createProposal(
        address token,
        uint256 lpAmount,
        uint256 timestampLimit,
        uint256 investBaseLimit,
        uint256 maxTokenPriceLimit,
        uint256 instantTradePercentage
    ) external onlyTrader {
        require(token.isContract(), "BTP: not a contract");
        require(token != poolParameters.baseToken, "BTP: wrong token");
    }

    function investProposal(uint256 proposalId, uint256 lpAmount) external {}

    function divestProposal(uint256 proposalId, uint256 lp2Amount) external {}

    function exchange(
        uint256 proposalId,
        address from,
        uint256 amount
    ) external onlyTraderAdmin {}
}
