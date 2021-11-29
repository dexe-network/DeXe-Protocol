// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/IInvestTraderPool.sol";
import "../interfaces/trader/ITraderPoolInvestProposal.sol";

import "./RiskyTraderPool.sol";

contract InvestTraderPool is IInvestTraderPool, RiskyTraderPool {
    using SafeERC20 for IERC20;
    using TraderPoolHelper for PoolParameters;
    using MathHelper for uint256;

    ITraderPoolInvestProposal internal _traderPoolProposal;

    function __InvestTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters,
        address traderPoolProposal
    ) public override {
        __RiskyTraderPool_init(name, symbol, _poolParameters);

        _traderPoolProposal = ITraderPoolInvestProposal(traderPoolProposal);

        IERC20(_poolParameters.baseToken).safeApprove(traderPoolProposal, MAX_UINT);
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

    function changeProposalRestrictions(
        uint256 proposalId,
        uint256 timestampLimit,
        uint256 investLPLimit
    ) external onlyTraderAdmin {
        _traderPoolProposal.changeProposalRestrictions(proposalId, timestampLimit, investLPLimit);
    }

    function createProposal(
        uint256 lpAmount,
        uint256 timestampLimit,
        uint256 investBaseLimit
    ) external onlyTrader {
        require(balanceOf(_msgSender()) >= lpAmount, "BTP: not enought LPs");

        uint256 baseAmount = _divestPositions(lpAmount);

        _traderPoolProposal.createProposal(timestampLimit, investBaseLimit, lpAmount, baseAmount);

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

    function withdrawProposal(uint256 proposalId, uint256 amount) external onlyTraderAdmin {
        _traderPoolProposal.withdraw(proposalId, amount);
    }

    function supplyProposal(uint256 proposalId, uint256 amount) external {
        _traderPoolProposal.supply(proposalId, _msgSender(), amount);
    }
}
