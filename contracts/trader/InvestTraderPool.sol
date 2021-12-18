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
        require(_msgSender() == address(_traderPoolProposal), "ITP: not a proposal pool");
        _;
    }

    function __InvestTraderPool_init(
        string calldata name,
        string calldata symbol,
        ITraderPool.PoolParameters memory _poolParameters,
        address traderPoolProposal
    ) public override initializer {
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

    function changeProposalRestrictions(
        uint256 proposalId,
        ITraderPoolInvestProposal.ProposalLimits calldata proposalLimits
    ) external onlyTraderAdmin {
        _traderPoolProposal.changeProposalRestrictions(proposalId, proposalLimits);
    }

    function exchange(
        address from,
        address to,
        uint256 amount,
        uint256 minAmountOut,
        address[] calldata optionalPath
    ) public override onlyTraderAdmin {
        if (_firstExchange == 0) {
            _firstExchange = block.timestamp;
        }

        super.exchange(from, to, amount, minAmountOut, optionalPath);
    }

    function invest(uint256 amountInBaseToInvest, uint256[] calldata minPositionsOut)
        public
        override
    {
        require(
            isTraderAdmin(_msgSender()) ||
                (_firstExchange != 0 &&
                    _firstExchange + coreProperties.getDelayForRiskyPool() <= block.timestamp),
            "ITP: investment delay"
        );

        super.invest(amountInBaseToInvest, minPositionsOut);
    }

    function createProposal(
        uint256 lpAmount,
        ITraderPoolInvestProposal.ProposalLimits calldata proposalLimits,
        uint256[] calldata minPositionsOut
    ) external onlyTrader {
        uint256 baseAmount = _divestPositions(lpAmount, minPositionsOut);

        _traderPoolProposal.create(proposalLimits, lpAmount, baseAmount);

        _burn(_msgSender(), lpAmount);
    }

    function investProposal(
        uint256 proposalId,
        uint256 lpAmount,
        uint256[] calldata minPositionsOut
    ) external {
        require(
            isTraderAdmin(_msgSender()) ||
                (_firstExchange != 0 &&
                    _firstExchange + coreProperties.getDelayForRiskyPool() <= block.timestamp),
            "ITP: investment delay"
        );

        uint256 baseAmount = _divestPositions(lpAmount, minPositionsOut);

        _traderPoolProposal.invest(proposalId, _msgSender(), lpAmount, baseAmount);

        _updateFrom(_msgSender(), lpAmount);
        _burn(_msgSender(), lpAmount);
    }

    function reinvestProposal(uint256 proposalId, uint256[] calldata minPositionsOut) external {
        uint256 receivedBase = _traderPoolProposal.divest(proposalId, _msgSender());

        _invest(address(_traderPoolProposal), receivedBase, minPositionsOut);
    }

    function reinvestAllProposals(uint256[] calldata minPositionsOut) external {
        uint256 receivedBase = _traderPoolProposal.divestAll(_msgSender());

        _invest(address(_traderPoolProposal), receivedBase, minPositionsOut);
    }
}
