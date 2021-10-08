// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/dex/IDEXAbstraction.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/insurance/IInsurance.sol";

import "../libs/DecimalsConverter.sol";

import "../helpers/AbstractDependant.sol";

abstract contract TraderPool is
    ITraderPool,
    AccessControlUpgradeable,
    ERC20Upgradeable,
    AbstractDependant
{
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    bytes32 public constant TRADER_ROLE = keccak256("TRADER_ROLE");

    IERC20 internal _dexeToken;
    IPriceFeed internal _priceFeed;
    IDEXAbstraction internal _dexAbstraction;
    IInsurance internal _insurance;

    PoolParameters public poolParameters;

    EnumerableSet.AddressSet internal _privateInvestors;

    EnumerableSet.AddressSet internal _openPositions;

    modifier onlyTrader() {
        require(isTrader(_msgSender()), "TraderPool: msg.sender is not a trader");
        _;
    }

    function isTrader(address who) public view returns (bool) {
        return hasRole(TRADER_ROLE, who);
    }

    function __TraderPool_init(
        string memory name,
        string memory symbol,
        string memory description,
        bool activePortfolio,
        bool privatePool,
        uint256 totalLPEmission,
        address baseToken,
        uint256 minimalInvestment,
        CommissionPeriod commissionPeriod,
        uint256 commissionPercentage
    ) public {
        __AccessControl_init();
        __ERC20_init(name, symbol);

        poolParameters = PoolParameters(
            description,
            activePortfolio,
            privatePool,
            totalLPEmission,
            baseToken,
            ERC20(baseToken).decimals(),
            minimalInvestment,
            commissionPeriod,
            commissionPercentage
        );

        _setupRole(TRADER_ROLE, _msgSender());
        _setRoleAdmin(TRADER_ROLE, TRADER_ROLE);
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        public
        virtual
        override
        onlyInjectorOrZero
    {
        _dexeToken = IERC20(contractsRegistry.getDEXEContract());
        _priceFeed = IPriceFeed(contractsRegistry.getPriceFeedContract());
        _dexAbstraction = IDEXAbstraction(contractsRegistry.getDEXAbstractionContract());
        _insurance = IInsurance(contractsRegistry.getInsuranceContract());
    }

    function _getOpenPositionsPrice()
        internal
        view
        returns (
            uint256 totalPriceInBase,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        )
    {
        uint256 length = _openPositions.length();

        IERC20 baseToken = IERC20(poolParameters.baseToken);
        totalPriceInBase = baseToken.balanceOf(address(this));

        positionTokens = new address[](length);
        positionPricesInBase = new uint256[](length);

        IPriceFeed priceFeed = _priceFeed;

        for (uint256 i = 0; i < length; i++) {
            positionTokens[i] = _openPositions.at(i);

            positionPricesInBase[i] = priceFeed.getPriceIn(
                positionTokens[i],
                address(baseToken),
                IERC20(positionTokens[i]).balanceOf(address(this))
            );

            totalPriceInBase += positionPricesInBase[i];
        }
    }

    function _transferBaseAndMintLP(uint256 totalBaseInPool, uint256 amountInBaseToInvest)
        internal
    {
        uint256 baseTokenDecimals = poolParameters.baseTokenDecimals;

        IERC20(poolParameters.baseToken).safeTransferFrom(
            _msgSender(),
            address(this),
            DecimalsConverter.convertFrom18(amountInBaseToInvest, baseTokenDecimals)
        );

        uint256 toMintLP = (totalSupply() * amountInBaseToInvest) /
            DecimalsConverter.convertTo18(totalBaseInPool, baseTokenDecimals);

        require(
            totalSupply() + toMintLP <= poolParameters.totalLPEmission,
            "TraderPool: minting more than emission allows"
        );

        _mint(_msgSender(), toMintLP);
    }

    function _investPassivePortfolio(uint256 amountInBaseToInvest) internal {
        (uint256 totalBase, , ) = _getOpenPositionsPrice();
        _transferBaseAndMintLP(totalBase, amountInBaseToInvest);
    }

    function _investActivePortfolio(uint256 amountInBaseToInvest) internal {
        uint256 baseTokenDecimals = poolParameters.baseTokenDecimals;
        (
            uint256 totalBase,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = _getOpenPositionsPrice();

        _transferBaseAndMintLP(totalBase, amountInBaseToInvest);

        IPriceFeed priceFeed = _priceFeed;
        address baseToken = poolParameters.baseToken;
        uint256 convertedBase = DecimalsConverter.convertTo18(totalBase, baseTokenDecimals);

        for (uint256 i = 0; i < positionTokens.length; i++) {
            uint256 tokensToExchange = (convertedBase * amountInBaseToInvest) /
                positionPricesInBase[i];

            priceFeed.exchangeTo(baseToken, positionTokens[i], tokensToExchange);
        }
    }

    function invest(uint256 amountInBaseToInvest) external virtual {
        require(
            !poolParameters.privatePool ||
                isTrader(_msgSender()) ||
                _privateInvestors.contains(_msgSender()),
            "TraderPool: msg.sender is not allowed to invest"
        );
        require(amountInBaseToInvest > 0, "TraderPool: zero investment");
        require(
            amountInBaseToInvest >= poolParameters.minimalInvestment,
            "TraderPool: underinvestment"
        );

        if (poolParameters.activePortfolio) {
            _investActivePortfolio(amountInBaseToInvest);
        } else {
            _investPassivePortfolio(amountInBaseToInvest);
        }
    }

    function reinvestCommission() external onlyTrader {}

    function divest(uint256 amountLP) external virtual {
        require(
            !isTrader(_msgSender()) || _openPositions.length() == 0,
            "TraderPool: can't divest"
        );
    }

    function proposeRiskyInvestment() external onlyTrader {}
}
