// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/Address.sol";

import "../interfaces/trader/IBasicTraderPool.sol";
import "../interfaces/trader/ITraderPoolRiskyProposal.sol";

import "./TraderPool.sol";

contract BasicTraderPool is IBasicTraderPool, TraderPool {
    using Address for address;
    using TraderPoolHelper for PoolParameters;
    using MathHelper for uint256;
    using SafeERC20 for IERC20;

    ITraderPoolRiskyProposal internal _traderPoolProposal;

    function __BasicTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters,
        address traderPoolProposal
    ) public override {
        __TraderPool_init(name, symbol, _poolParameters);

        _traderPoolProposal = ITraderPoolRiskyProposal(traderPoolProposal);

        IERC20(_poolParameters.baseToken).safeApprove(traderPoolProposal, MAX_UINT);
    }

    function setDependencies(IContractsRegistry contractsRegistry) public override dependant {
        super.setDependencies(contractsRegistry);

        AbstractDependant(address(_traderPoolProposal)).setDependencies(contractsRegistry);
    }

    function proposalPoolAddress() external view override returns (address) {
        return address(_traderPoolProposal);
    }

    function totalEmission() public view override returns (uint256) {
        return totalSupply() + _traderPoolProposal.totalLockedLP();
    }

    function divestAll() public override {
        reinvestAllProposals();
        divest(balanceOf(_msgSender()));
    }

    function exchange(
        address from,
        address to,
        uint256 amount
    ) public override onlyTraderAdmin {
        require(_priceFeed.isSupportedBaseToken(to), "BTP: invalid exchange");

        super.exchange(from, to, amount);
    }

    function changeProposalRestrictions(
        uint256 proposalId,
        uint256 timestampLimit,
        uint256 investLPLimit,
        uint256 maxTokenPriceLimit
    ) external onlyTraderAdmin {
        _traderPoolProposal.changeProposalRestrictions(
            proposalId,
            timestampLimit,
            investLPLimit,
            maxTokenPriceLimit
        );
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
        require(token != poolParameters.baseToken, "BTP: wrong proposal token");
        require(balanceOf(_msgSender()) >= lpAmount, "BTP: not enought LPs");

        uint256 baseAmount = _divestPositions(lpAmount);

        _traderPoolProposal.createProposal(
            token,
            timestampLimit,
            investBaseLimit,
            maxTokenPriceLimit,
            lpAmount,
            baseAmount,
            instantTradePercentage
        );

        _burn(_msgSender(), lpAmount);
    }

    function investProposal(uint256 proposalId, uint256 lpAmount) external {
        require(lpAmount > 0 && balanceOf(_msgSender()) >= lpAmount, "BTP: wrong LPs amount");

        uint256 baseAmount = _divestPositions(lpAmount);

        _traderPoolProposal.investProposal(proposalId, _msgSender(), lpAmount, baseAmount);

        _updateFrom(_msgSender(), lpAmount);
        _burn(_msgSender(), lpAmount);
    }

    function reinvestProposal(uint256 proposalId, uint256 lp2Amount) external {
        uint256 receivedBase = _traderPoolProposal.divestProposal(
            proposalId,
            _msgSender(),
            lp2Amount
        );

        _invest(address(_traderPoolProposal), receivedBase);
    }

    function reinvestAllProposals() public {
        uint256 receivedBase = _traderPoolProposal.divestAllProposals(_msgSender());

        _invest(address(_traderPoolProposal), receivedBase);
    }

    function exchangeProposal(
        uint256 proposalId,
        address from,
        uint256 amount
    ) external onlyTraderAdmin {
        _traderPoolProposal.exchange(proposalId, from, amount);
    }
}
