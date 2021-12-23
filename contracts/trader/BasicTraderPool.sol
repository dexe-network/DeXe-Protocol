// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/IBasicTraderPool.sol";
import "../interfaces/trader/ITraderPoolRiskyProposal.sol";

import "./TraderPool.sol";

contract BasicTraderPool is IBasicTraderPool, TraderPool {
    using MathHelper for uint256;
    using SafeERC20 for IERC20;

    ITraderPoolRiskyProposal internal _traderPoolProposal;

    modifier onlyProposalPool() {
        _onlyProposalPool();
        _;
    }
    event ProposalCreated(
        uint256 index,
        address token,
        ITraderPoolRiskyProposal.ProposalLimits proposalLimits
    );
    event ProposalInvest(uint256 index, address investor, uint256 amountLP, uint256 amountBase);
    event ProposalDivest(uint256 index, address investor, uint256 amount, uint256 commission);
    event ProposalExchange(
        uint256 index,
        address fromToken,
        address toToken,
        uint256 fromVolume,
        uint256 toVolume
    );

    function _onlyProposalPool() internal view {
        require(msg.sender == address(_traderPoolProposal), "BTP: not a proposal");
    }

    function _isSupportedBaseToken(address token) internal view {
        require(priceFeed.isSupportedBaseToken(token), "BTP: invalid exchange");
    }

    function __BasicTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters calldata _poolParameters,
        address traderPoolProposal
    ) public initializer {
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

    function exchangeFromExact(
        address from,
        address to,
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata optionalPath
    ) public override onlyTraderAdmin {
        _isSupportedBaseToken(to);

        super.exchangeFromExact(from, to, amountIn, minAmountOut, optionalPath);
    }

    function exchangeToExact(
        address from,
        address to,
        uint256 amountOut,
        uint256 maxAmountIn,
        address[] calldata optionalPath
    ) public override onlyTraderAdmin {
        _isSupportedBaseToken(to);

        super.exchangeToExact(from, to, amountOut, maxAmountIn, optionalPath);
    }

    function createProposal(
        address token,
        uint256 lpAmount,
        ITraderPoolRiskyProposal.ProposalLimits calldata proposalLimits,
        uint256 instantTradePercentage,
        uint256[] calldata minDivestOut,
        uint256 minProposalOut,
        address[] calldata optionalPath
    ) external override onlyTrader {
        uint256 baseAmount = _divestPositions(lpAmount, minDivestOut);

        _traderPoolProposal.create(
            token,
            proposalLimits,
            lpAmount,
            baseAmount,
            instantTradePercentage,
            minProposalOut,
            optionalPath
        );

        _burn(msg.sender, lpAmount);
    }

    function investProposal(
        uint256 proposalId,
        uint256 lpAmount,
        uint256[] calldata minDivestOut,
        uint256 minProposalOut
    ) external override {
        uint256 baseAmount = _divestPositions(lpAmount, minDivestOut);

        _traderPoolProposal.invest(proposalId, msg.sender, lpAmount, baseAmount, minProposalOut);

        _updateFromData(msg.sender, lpAmount);
        _burn(msg.sender, lpAmount);
    }

    function reinvestProposal(
        uint256 proposalId,
        uint256 lp2Amount,
        uint256[] calldata minPositionsOut,
        uint256 minProposalOut
    ) external override {
        uint256 receivedBase = _traderPoolProposal.divest(
            proposalId,
            msg.sender,
            lp2Amount,
            minProposalOut
        );

        _invest(address(_traderPoolProposal), receivedBase, minPositionsOut);
    }

    function reinvestAllProposals(
        uint256[] calldata minInvestsOut,
        uint256[] calldata minProposalsOut
    ) external override {
        uint256 receivedBase = _traderPoolProposal.divestAll(msg.sender, minProposalsOut);

        _invest(address(_traderPoolProposal), receivedBase, minInvestsOut);
    }

    function checkRemoveInvestor(address user) external override onlyProposalPool {
        if (!isTrader(user)) {
            _checkRemoveInvestor(user, 0);
        }
    }

    function checkNewInvestor(address user) external override onlyProposalPool {
        if (!isTrader(user)) {
            _checkNewInvestor(user);
        }
    }
}
