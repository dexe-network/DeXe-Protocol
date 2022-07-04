// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/IBasicTraderPool.sol";
import "../interfaces/trader/ITraderPoolRiskyProposal.sol";

import "./TraderPool.sol";

contract BasicTraderPool is IBasicTraderPool, TraderPool {
    using MathHelper for uint256;
    using SafeERC20 for IERC20;

    ITraderPoolRiskyProposal internal _traderPoolProposal;

    event ProposalDivested(
        uint256 proposalId,
        address user,
        uint256 divestedLP2,
        uint256 receivedLP,
        uint256 receivedBase
    );

    modifier onlyProposalPool() {
        _onlyProposalPool();
        _;
    }

    function _onlyProposalPool() internal view {
        require(msg.sender == address(_traderPoolProposal), "BTP: not a proposal");
    }

    function _canTrade(address token) internal view {
        require(
            token == _poolParameters.baseToken || coreProperties.isWhitelistedToken(token),
            "BTP: invalid exchange"
        );
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

    function setDependencies(address contractsRegistry) public override dependant {
        super.setDependencies(contractsRegistry);

        AbstractDependant(address(_traderPoolProposal)).setDependencies(contractsRegistry);
    }

    function canRemovePrivateInvestor(address investor) public view override returns (bool) {
        return
            balanceOf(investor) == 0 &&
            _traderPoolProposal.getTotalActiveInvestments(investor) == 0;
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
        uint256 amountBound,
        address[] calldata optionalPath,
        ExchangeType exType
    ) public override {
        _canTrade(to);

        super.exchange(from, to, amount, amountBound, optionalPath, exType);
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

        uint256 lpMinted = _investPositions(
            address(_traderPoolProposal),
            receivedBase,
            minPositionsOut
        );
        _updateToData(msg.sender, receivedBase);

        emit ProposalDivested(proposalId, msg.sender, lp2Amount, lpMinted, receivedBase);
    }

    function checkRemoveInvestor(address user) external override onlyProposalPool {
        _checkRemoveInvestor(user, 0);
    }

    function checkNewInvestor(address user) external override onlyProposalPool {
        _checkNewInvestor(user);
    }
}
