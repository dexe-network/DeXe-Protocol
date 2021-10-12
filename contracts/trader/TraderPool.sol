// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/dex/IDEXAbstraction.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/insurance/IInsurance.sol";

import "../libs/DecimalsConverter.sol";
import "../libs/TraderPoolHelper.sol";

import "../helpers/AbstractDependant.sol";
import "../core/Globals.sol";

abstract contract TraderPool is ITraderPool, ERC20Upgradeable, AbstractDependant {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;
    using Math for uint256;
    using DecimalsConverter for uint256;
    using TraderPoolHelper for PoolParameters;

    IERC20 internal _dexeToken;
    IPriceFeed internal _priceFeed;
    IDEXAbstraction internal _dexAbstraction;
    IInsurance internal _insurance;
    ICoreProperties internal _coreProperties;
    address internal _treasuryAddress;
    address internal _dividendsAddress;

    mapping(address => bool) public traderAdmins;

    PoolParameters public poolParameters;

    EnumerableSet.AddressSet internal _privateInvestors;
    EnumerableSet.AddressSet internal _investors;

    mapping(address => InvestorInfo) public investorsInfo;

    EnumerableSet.AddressSet internal _openPositions;

    modifier onlyTraderAdmin() {
        require(isTraderAdmin(_msgSender()), "TraderPool: msg.sender is not a trader admin");
        _;
    }

    function isTraderAdmin(address who) public view returns (bool) {
        return traderAdmins[who];
    }

    function isTrader(address who) public view returns (bool) {
        return poolParameters.trader == who;
    }

    function __TraderPool_init(
        string memory name,
        string memory symbol,
        string memory description,
        address trader,
        bool activePortfolio,
        bool privatePool,
        uint256 totalLPEmission,
        address baseToken,
        uint256 minimalInvestment,
        ICoreProperties.CommissionPeriod commissionPeriod,
        uint256 commissionPercentage
    ) public {
        __ERC20_init(name, symbol);

        poolParameters = PoolParameters(
            description,
            trader,
            activePortfolio,
            privatePool,
            totalLPEmission,
            baseToken,
            ERC20(baseToken).decimals(),
            minimalInvestment,
            commissionPeriod,
            commissionPercentage
        );
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

    function _transferBaseAndMintLP(uint256 totalBaseInPool, uint256 amountInBaseToInvest)
        internal
    {
        uint256 baseTokenDecimals = poolParameters.baseTokenDecimals;

        IERC20(poolParameters.baseToken).safeTransferFrom(
            _msgSender(),
            address(this),
            DecimalsConverter.convertFrom18(amountInBaseToInvest, baseTokenDecimals)
        );

        uint256 toMintLP = totalBaseInPool > 0
            ? (totalSupply() * amountInBaseToInvest) /
                totalBaseInPool.convertTo18(baseTokenDecimals)
            : amountInBaseToInvest;

        require(
            totalSupply() + toMintLP <= poolParameters.totalLPEmission,
            "TraderPool: minting more than emission allows"
        );

        _mint(_msgSender(), toMintLP);
    }

    function _investPassivePortfolio(uint256 amountInBaseToInvest) internal {
        (uint256 totalBase, , ) = poolParameters.getOpenPositionsPrice(_openPositions, _priceFeed);
        _transferBaseAndMintLP(totalBase, amountInBaseToInvest);
    }

    function _investActivePortfolio(uint256 amountInBaseToInvest) internal {
        uint256 baseTokenDecimals = poolParameters.baseTokenDecimals;
        (
            uint256 totalBase,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = poolParameters.getOpenPositionsPrice(_openPositions, _priceFeed);

        _transferBaseAndMintLP(totalBase, amountInBaseToInvest);

        IPriceFeed priceFeed = _priceFeed;
        address baseToken = poolParameters.baseToken;

        for (uint256 i = 0; i < positionTokens.length; i++) {
            uint256 tokensToExchange = (positionPricesInBase[i] *
                amountInBaseToInvest.convertFrom18(baseTokenDecimals)) / totalBase;

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

        if (!isTrader(_msgSender())) {
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

    function _transferCommission(
        uint256 commission,
        address where,
        uint256 percentage
    ) private {
        _dexeToken.safeTransfer(where, (commission * percentage) / PERCENTAGE_100);
    }

    function _distributeCommission(uint256 baseTokensToDistribute, uint256 lpTokensToDistribute)
        internal
    {
        require(baseTokensToDistribute > 0, "TraderPool: no commission available");

        (
            uint256 dexeCommissionPercentage,
            uint256[] memory dexeIndividualPercentages
        ) = _coreProperties.getDEXECommissionPercentages();

        uint256 dexeLPCommission = (lpTokensToDistribute * dexeCommissionPercentage) /
            PERCENTAGE_100;
        uint256 dexeBaseCommission = ((baseTokensToDistribute * dexeCommissionPercentage) /
            PERCENTAGE_100).convertFrom18(poolParameters.baseTokenDecimals);
        uint256 dexeDexeCommission = _priceFeed.exchangeTo(
            poolParameters.baseToken,
            address(_dexeToken),
            dexeBaseCommission
        );

        _mint(poolParameters.trader, lpTokensToDistribute - dexeLPCommission);

        _transferCommission(
            dexeDexeCommission,
            address(_insurance),
            dexeIndividualPercentages[uint256(ICoreProperties.CommissionTypes.INSURANCE)]
        );
        _transferCommission(
            dexeDexeCommission,
            _treasuryAddress,
            dexeIndividualPercentages[uint256(ICoreProperties.CommissionTypes.TREASURY)]
        );
        _transferCommission(
            dexeDexeCommission,
            _dividendsAddress,
            dexeIndividualPercentages[uint256(ICoreProperties.CommissionTypes.DIVIDENDS)]
        );
    }

    function reinvestCommission(uint256 offset, uint256 limit) external virtual onlyTraderAdmin {
        require(_openPositions.length() == 0, "TraderPool: can't reinvest with opened positions");

        uint256 to = (offset + limit).min(_investors.length()).max(offset);
        uint256 totalSupply = totalSupply();

        uint256 allBaseCommission;
        uint256 allLPCommission;

        for (uint256 i = offset; i < to; i++) {
            address investor = _investors.at(i);
            uint256 currentCommissionEpoch = _getCurrentCommissionEpoch(block.timestamp);

            if (currentCommissionEpoch >= investorsInfo[investor].commissionUnlockEpoch) {
                investorsInfo[investor].commissionUnlockEpoch = currentCommissionEpoch + 1;

                (uint256 baseCommission, uint256 lpCommission) = _calculateCommissionOnReinvest(
                    investor,
                    totalSupply
                );

                _burn(investor, lpCommission);

                allBaseCommission += baseCommission;
                allLPCommission += lpCommission;
            }
        }

        _distributeCommission(allBaseCommission, allLPCommission);
    }

    function _calculateCommissionOnReinvest(address investor, uint256 oldTotalSupply)
        internal
        view
        returns (uint256, uint256)
    {
        uint256 baseTokenBalance = ERC20(poolParameters.baseToken)
            .balanceOf(address(this))
            .convertTo18(poolParameters.baseTokenDecimals);

        uint256 investorBaseAmount = (baseTokenBalance * balanceOf(investor)) / oldTotalSupply;

        return
            poolParameters.calculateCommission(
                investorBaseAmount,
                balanceOf(investor),
                investorsInfo[investor].investedBase
            );
    }

    function _calculateCommissionOnDivest(
        address investor,
        uint256 investorBaseAmount,
        uint256 amountLP
    ) internal view returns (uint256, uint256) {
        uint256 investedBaseConverted = (investorsInfo[investor].investedBase * amountLP) /
            balanceOf(investor);

        return
            poolParameters.calculateCommission(
                investorBaseAmount,
                amountLP,
                investedBaseConverted
            );
    }

    function _divestInvestor(uint256 amountLP) internal {
        IERC20 baseToken = IERC20(poolParameters.baseToken);

        uint256 totalSupply = totalSupply();
        uint256 investorBalance = balanceOf(_msgSender());

        uint256 length = _openPositions.length();
        uint256 investorBaseAmount = (baseToken.balanceOf(address(this)) * amountLP) / totalSupply;

        for (uint256 i = 0; i < length; i++) {
            ERC20 positionToken = ERC20(_openPositions.at(i));

            uint256 positionAmount = (positionToken.balanceOf(address(this)) * amountLP) /
                totalSupply;

            investorBaseAmount += _priceFeed.exchangeTo(
                address(positionToken),
                address(baseToken),
                positionAmount
            );
        }

        investorBaseAmount = investorBaseAmount.convertTo18(poolParameters.baseTokenDecimals);

        (uint256 baseCommission, uint256 lpCommission) = _calculateCommissionOnDivest(
            _msgSender(),
            investorBaseAmount,
            amountLP
        );

        _burn(_msgSender(), amountLP);

        baseToken.safeTransfer(
            _msgSender(),
            (investorBaseAmount - baseCommission).convertFrom18(poolParameters.baseTokenDecimals)
        );

        if (baseCommission > 0) {
            _distributeCommission(baseCommission, lpCommission);
        }

        if (amountLP == investorBalance) {
            _investors.remove(_msgSender());
            delete investorsInfo[_msgSender()];
        } else {
            investorsInfo[_msgSender()].investedBase -=
                (amountLP * investorsInfo[_msgSender()].investedBase) /
                investorBalance;
        }
    }

    function _divestTrader(uint256 amountLP) internal {
        IERC20 baseToken = IERC20(poolParameters.baseToken);

        uint256 baseTokenBalance = baseToken.balanceOf(address(this));
        uint256 traderBaseAmount = (baseTokenBalance * amountLP) / totalSupply();

        _burn(_msgSender(), amountLP);

        baseToken.safeTransfer(_msgSender(), traderBaseAmount);
    }

    function divest(uint256 amountLP) external virtual {
        require(
            !isTrader(_msgSender()) || _openPositions.length() == 0,
            "TraderPool: can't divest"
        );
        require(amountLP <= balanceOf(_msgSender()), "TraderPool: can't divest that amount");

        if (!isTrader(_msgSender())) {
            _divestInvestor(amountLP);
        } else {
            _divestTrader(amountLP);
        }
    }

    function exchange(
        address from,
        address to,
        uint256 amount
    ) external virtual onlyTraderAdmin {}

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {}
}
