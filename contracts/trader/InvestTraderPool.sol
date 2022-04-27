// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/IInvestTraderPool.sol";
import "../interfaces/trader/ITraderPoolInvestProposal.sol";

import "./TraderPool.sol";

contract InvestTraderPool is IInvestTraderPool, TraderPool {
    using SafeERC20 for IERC20;
    using MathHelper for uint256;
    using DecimalsConverter for uint256;

    ITraderPoolInvestProposal internal _traderPoolProposal;

    uint256 internal _firstExchange;

    event ProposalCreated(
        uint256 index,
        address token,
        ITraderPoolInvestProposal.ProposalLimits proposalLimits
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

    modifier onlyProposalPool() {
        _onlyProposalPool();
        _;
    }

    function _onlyProposalPool() internal view {
        require(msg.sender == address(_traderPoolProposal), "ITP: not a proposal");
    }

    function __InvestTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters calldata _poolParameters,
        address traderPoolProposal
    ) public initializer {
        __TraderPool_init(name, symbol, _poolParameters);

        _traderPoolProposal = ITraderPoolInvestProposal(traderPoolProposal);

        IERC20(_poolParameters.baseToken).safeApprove(traderPoolProposal, MAX_UINT);
    }

    function setDependencies(address contractsRegistry) public override dependant {
        super.setDependencies(contractsRegistry);

        AbstractDependant(address(_traderPoolProposal)).setDependencies(contractsRegistry);
    }

    function proposalPoolAddress() external view override returns (address) {
        return address(_traderPoolProposal);
    }

    function totalEmission() public view override returns (uint256) {
        return totalSupply() + _traderPoolProposal.totalLockedLP();
    }

    function getInvestDelayEnd() public view override returns (uint256) {
        uint256 delay = coreProperties.getDelayForRiskyPool();

        return delay != 0 ? (_firstExchange != 0 ? _firstExchange + delay : MAX_UINT) : 0;
    }

    function invest(uint256 amountInBaseToInvest, uint256[] calldata minPositionsOut)
        public
        override
    {
        require(
            isTraderAdmin(msg.sender) || getInvestDelayEnd() <= block.timestamp,
            "ITP: investment delay"
        );

        super.invest(amountInBaseToInvest, minPositionsOut);
    }

    function _setFirstExchangeTime() internal {
        if (_firstExchange == 0) {
            _firstExchange = block.timestamp;
        }
    }

    function exchangeFromExact(
        address from,
        address to,
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata optionalPath
    ) public override onlyTraderAdmin {
        _setFirstExchangeTime();

        super.exchangeFromExact(from, to, amountIn, minAmountOut, optionalPath);
    }

    function exchangeToExact(
        address from,
        address to,
        uint256 amountOut,
        uint256 maxAmountIn,
        address[] calldata optionalPath
    ) public override onlyTraderAdmin {
        _setFirstExchangeTime();

        super.exchangeToExact(from, to, amountOut, maxAmountIn, optionalPath);
    }

    function createProposal(
        string calldata descriptionURL,
        uint256 lpAmount,
        ITraderPoolInvestProposal.ProposalLimits calldata proposalLimits,
        uint256[] calldata minPositionsOut
    ) external override onlyTrader {
        uint256 baseAmount = _divestPositions(lpAmount, minPositionsOut);

        _traderPoolProposal.create(descriptionURL, proposalLimits, lpAmount, baseAmount);

        _burn(msg.sender, lpAmount);
    }

    function investProposal(
        uint256 proposalId,
        uint256 lpAmount,
        uint256[] calldata minPositionsOut
    ) external override {
        require(
            isTraderAdmin(msg.sender) || getInvestDelayEnd() <= block.timestamp,
            "ITP: investment delay"
        );

        uint256 baseAmount = _divestPositions(lpAmount, minPositionsOut);

        _traderPoolProposal.invest(proposalId, msg.sender, lpAmount, baseAmount);

        _updateFromData(msg.sender, lpAmount);
        _burn(msg.sender, lpAmount);
    }

    function reinvestProposal(uint256 proposalId, uint256[] calldata minPositionsOut)
        external
        override
    {
        uint256 receivedBase = _traderPoolProposal.divest(proposalId, msg.sender);

        _invest(address(_traderPoolProposal), receivedBase, minPositionsOut);
    }

    function reinvestAllProposals(uint256[] calldata minPositionsOut) external override {
        uint256 receivedBase = _traderPoolProposal.divestAll(msg.sender);

        _invest(address(_traderPoolProposal), receivedBase, minPositionsOut);
    }

    function checkRemoveInvestor(address user) external override onlyProposalPool {
        _checkRemoveInvestor(user, 0);
    }

    function checkNewInvestor(address user) external override onlyProposalPool {
        _checkNewInvestor(user);
    }
}
