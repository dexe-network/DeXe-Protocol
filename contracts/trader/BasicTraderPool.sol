// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/IBasicTraderPool.sol";
import "../interfaces/trader/ITraderPoolRiskyProposal.sol";

import "./TraderPool.sol";

contract BasicTraderPool is IBasicTraderPool, TraderPool {
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

    function exchange(
        address from,
        address to,
        uint256 amount,
        address[] memory optionalPath,
        uint256 minAmountOut
    ) public override onlyTraderAdmin {
        require(priceFeed.isSupportedBaseToken(to), "BTP: invalid exchange");

        super.exchange(from, to, amount, optionalPath, minAmountOut);
    }

    function createProposal(
        address token,
        uint256 lpAmount,
        ITraderPoolRiskyProposal.ProposalLimits calldata proposalLimits,
        uint256 instantTradePercentage,
        uint256[] calldata minDivestOut,
        address[] calldata optionalPath,
        uint256 minProposalOut
    ) external onlyTrader {
        uint256 baseAmount = _divestPositions(lpAmount, minDivestOut);

        _traderPoolProposal.createProposal(
            token,
            proposalLimits,
            lpAmount,
            baseAmount,
            instantTradePercentage,
            optionalPath,
            minProposalOut
        );

        _burn(_msgSender(), lpAmount);
    }

    function investProposal(
        uint256 proposalId,
        uint256 lpAmount,
        uint256[] calldata minDivestOut,
        uint256 minProposalOut
    ) external {
        uint256 baseAmount = _divestPositions(lpAmount, minDivestOut);

        _traderPoolProposal.investProposal(
            proposalId,
            _msgSender(),
            lpAmount,
            baseAmount,
            minProposalOut
        );

        _updateFrom(_msgSender(), lpAmount);
        _burn(_msgSender(), lpAmount);
    }

    function reinvestProposal(
        uint256 proposalId,
        uint256 lp2Amount,
        uint256[] calldata minPositionsOut,
        uint256 minProposalOut
    ) external {
        uint256 receivedBase = _traderPoolProposal.divestProposal(
            proposalId,
            _msgSender(),
            lp2Amount,
            minProposalOut
        );

        _invest(address(_traderPoolProposal), receivedBase, minPositionsOut);
    }

    function reinvestAllProposals(
        uint256[] calldata minInvestsOut,
        uint256[] calldata minProposalsOut
    ) external {
        uint256 receivedBase = _traderPoolProposal.divestAllProposals(
            _msgSender(),
            minProposalsOut
        );

        _invest(address(_traderPoolProposal), receivedBase, minInvestsOut);
    }
}
