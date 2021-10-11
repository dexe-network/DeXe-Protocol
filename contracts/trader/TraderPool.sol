// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
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
import "../core/Globals.sol";

abstract contract TraderPool is
    ITraderPool,
    AccessControlEnumerableUpgradeable,
    ERC20Upgradeable,
    AbstractDependant
{
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;
    using Math for uint256;

    bytes32 public constant TRADER_ADMIN_ROLE = keccak256("TRADER_ADMIN_ROLE");

    IERC20 internal _dexeToken;
    IPriceFeed internal _priceFeed;
    IDEXAbstraction internal _dexAbstraction;
    IInsurance internal _insurance;
    ICoreProperties internal _coreProperties;
    address internal _treasuryAddress;
    address internal _dividendsAddress;

    PoolParameters public poolParameters;

    EnumerableSet.AddressSet internal _privateInvestors;
    EnumerableSet.AddressSet internal _investors;

    mapping(address => InvestorInfo) public investorsInfo;

    EnumerableSet.AddressSet internal _openPositions;

    modifier onlyTraderAdmin() {
        require(isTraderAdmin(_msgSender()), "TraderPool: msg.sender is not a trader");
        _;
    }

    function isTraderAdmin(address who) public view returns (bool) {
        return hasRole(TRADER_ADMIN_ROLE, who);
    }

    function getTraderAccount() public view returns (address) {
        return getRoleMember(TRADER_ADMIN_ROLE, 0);
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
        ICoreProperties.CommissionPeriod commissionPeriod,
        uint256 commissionPercentage
    ) public {
        __AccessControlEnumerable_init();
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

        /// @dev the actual account used for trading is the one with index 0
        _setupRole(TRADER_ADMIN_ROLE, _msgSender());
        _setRoleAdmin(TRADER_ADMIN_ROLE, TRADER_ADMIN_ROLE);
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
        _coreProperties = ICoreProperties(contractsRegistry.getCorePropertiesContract());
        _treasuryAddress = contractsRegistry.getTreasuryContract();
        _dividendsAddress = contractsRegistry.getDividendsContract();
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
                isTraderAdmin(_msgSender()) ||
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

        if (_msgSender() != getTraderAccount()) {
            _investors.add(_msgSender());

            InvestorInfo memory oldInfo = investorsInfo[_msgSender()];

            investorsInfo[_msgSender()] = InvestorInfo(
                oldInfo.investedBase + amountInBaseToInvest,
                oldInfo.commissionUnlockEpoch == 0
                    ? _getCurrentCommissionEpoch(block.timestamp) + 1
                    : oldInfo.commissionUnlockEpoch
            );
        }
    }

    function _getCurrentCommissionEpoch(uint256 timestamp) internal view returns (uint256) {
        return
            (timestamp - _coreProperties.getBaseCommissionTimestamp()) /
            _coreProperties.getCommissionPeriod(poolParameters.commissionPeriod);
    }

    function _distributeCommission(uint256 lpTokensToDistribute) internal {
        require(lpTokensToDistribute > 0, "TraderPool: no commission available");

        ERC20 baseToken = ERC20(poolParameters.baseToken);
        uint256 baseTokenBalance = DecimalsConverter.convertTo18(
            baseToken.balanceOf(address(this)),
            baseToken.decimals()
        );

        (
            uint256 dexeCommissionPercentage,
            uint256[] memory dexeIndividualPercentages
        ) = _coreProperties.getDEXECommissionPercentages();

        uint256 dexeLPCommission = (lpTokensToDistribute * dexeCommissionPercentage) /
            PERCENTAGE_100;
        uint256 dexeBaseCommission = DecimalsConverter.convertFrom18(
            (baseTokenBalance * dexeLPCommission) / totalSupply(),
            baseToken.decimals()
        );
        uint256 dexeDexeCommission = _priceFeed.exchangeTo(
            address(baseToken),
            address(_dexeToken),
            dexeBaseCommission
        );

        _mint(getTraderAccount(), lpTokensToDistribute - dexeLPCommission);

        _dexeToken.safeTransfer(
            address(_insurance),
            (dexeDexeCommission * dexeIndividualPercentages[0]) / PERCENTAGE_100
        );
        _dexeToken.safeTransfer(
            _treasuryAddress,
            (dexeDexeCommission * dexeIndividualPercentages[1]) / PERCENTAGE_100
        );
        _dexeToken.safeTransfer(
            _dividendsAddress,
            (dexeDexeCommission * dexeIndividualPercentages[2]) / PERCENTAGE_100
        );
    }

    function _calculateLPCommission(address investor)
        internal
        view
        returns (uint256 lpCommission)
    {
        ERC20 baseToken = ERC20(poolParameters.baseToken);
        uint256 baseTokenBalance = DecimalsConverter.convertTo18(
            baseToken.balanceOf(address(this)),
            baseToken.decimals()
        );

        InvestorInfo storage investorInfo = investorsInfo[investor];

        uint256 investorLPBalance = balanceOf(investor);
        uint256 investorBaseAmount = (baseTokenBalance * investorLPBalance) / totalSupply();

        if (investorBaseAmount > investorInfo.investedBase) {
            uint256 baseCommission = ((investorBaseAmount - investorInfo.investedBase) *
                poolParameters.commissionPercentage) / PERCENTAGE_100;

            lpCommission = (investorLPBalance * baseCommission) / investorBaseAmount;
        }
    }

    function reinvestCommission(uint256 offset, uint256 limit) external onlyTraderAdmin {
        require(
            _openPositions.length() == 0,
            "TraderPool: can't reinvest commission with opened positions"
        );

        uint256 to = (offset + limit).min(_investors.length()).max(offset);

        uint256 allLPCommission;

        for (uint256 i = offset; i < to; i++) {
            address investor = _investors.at(i);
            uint256 currentCommissionEpoch = _getCurrentCommissionEpoch(block.timestamp);

            if (currentCommissionEpoch >= investorsInfo[investor].commissionUnlockEpoch) {
                investorsInfo[investor].commissionUnlockEpoch = currentCommissionEpoch + 1;

                uint256 lpCommission = _calculateLPCommission(investor);

                _burn(investor, lpCommission);
                allLPCommission += lpCommission;
            }
        }

        _distributeCommission(allLPCommission);
    }

    function divest(uint256 amountLP) external virtual {
        require(
            _msgSender() != getTraderAccount() || _openPositions.length() == 0,
            "TraderPool: can't divest"
        );
    }

    function exchange(
        address from,
        address to,
        uint256 amount
    ) external virtual {}
}
