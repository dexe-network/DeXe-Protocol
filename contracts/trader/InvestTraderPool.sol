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

    function invest(uint256 amountInBaseToInvest, uint256[] calldata minPositionsOut)
        public
        override
    {
        require(
            isTraderAdmin(msg.sender) ||
                (_firstExchange != 0 &&
                    _firstExchange + coreProperties.getDelayForRiskyPool() <= block.timestamp),
            "ITP: investment delay"
        );

        super.invest(amountInBaseToInvest, minPositionsOut);
    }

    function exchangeFromExact(
        address from,
        address to,
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata optionalPath
    ) public override onlyTraderAdmin {
        if (_firstExchange == 0) {
            _firstExchange = block.timestamp;
        }

        super.exchangeFromExact(from, to, amountIn, minAmountOut, optionalPath);
    }

    function exchangeToExact(
        address from,
        address to,
        uint256 amountOut,
        uint256 maxAmountIn,
        address[] calldata optionalPath
    ) public override onlyTraderAdmin {
        if (_firstExchange == 0) {
            _firstExchange = block.timestamp;
        }

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
            isTraderAdmin(msg.sender) ||
                (_firstExchange != 0 &&
                    _firstExchange + coreProperties.getDelayForRiskyPool() <= block.timestamp),
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
