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
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/insurance/IInsurance.sol";

import "../libs/DecimalsConverter.sol";
import "../libs/TraderPoolHelper.sol";
import "../libs/MathHelper.sol";

import "../helpers/AbstractDependant.sol";
import "../core/Globals.sol";

abstract contract TraderPool is ITraderPool, ERC20Upgradeable, AbstractDependant {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;
    using Math for uint256;
    using DecimalsConverter for uint256;
    using TraderPoolHelper for PoolParameters;
    using MathHelper for uint256;

    IERC20 internal _dexeToken;
    IPriceFeed internal _priceFeed;
    ICoreProperties internal _coreProperties;

    mapping(address => bool) public traderAdmins;

    PoolParameters public poolParameters;

    EnumerableSet.AddressSet internal _privateInvestors;
    EnumerableSet.AddressSet internal _investors;

    mapping(address => InvestorInfo) public investorsInfo;

    EnumerableSet.AddressSet internal _openPositions;

    modifier onlyTraderAdmin() {
        require(isTraderAdmin(_msgSender()), "TP: msg.sender is not a trader admin");
        _;
    }

    modifier onlyTrader() {
        require(isTrader(_msgSender()), "TP: msg.sender is not a trader admin");
        _;
    }

    function isPrivateInvestor(address who) public view returns (bool) {
        return _privateInvestors.contains(who);
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
        PoolParameters memory _poolParameters
    ) public initializer {
        __ERC20_init(name, symbol);

        poolParameters = _poolParameters;
        traderAdmins[_poolParameters.trader] = true;
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        public
        virtual
        override
        dependant
    {
        _dexeToken = IERC20(contractsRegistry.getDEXEContract());
        _priceFeed = IPriceFeed(contractsRegistry.getPriceFeedContract());
        _coreProperties = ICoreProperties(contractsRegistry.getCorePropertiesContract());
    }

    function changePoolParameters(
        string calldata descriptionURL,
        bool privatePool,
        uint256 totalLPEmission,
        uint256 minimalInvestment
    ) external onlyTraderAdmin {
        require(
            totalLPEmission == 0 || totalEmission() <= totalLPEmission,
            "TP: wrong emission supply"
        );

        poolParameters.descriptionURL = descriptionURL;
        poolParameters.privatePool = privatePool;
        poolParameters.totalLPEmission = totalLPEmission;
        poolParameters.minimalInvestment = minimalInvestment;
    }

    function changePrivateInvestors(bool remove, address[] calldata privateInvestors)
        external
        onlyTraderAdmin
    {
        for (uint256 i = 0; i < privateInvestors.length; i++) {
            _privateInvestors.add(privateInvestors[i]);

            if (remove && balanceOf(privateInvestors[i]) == 0) {
                _privateInvestors.remove(privateInvestors[i]);
            }
        }
    }

    function proposalPoolAddress() external view virtual override returns (address);

    function totalEmission() public view virtual override returns (uint256);

    function _transferBaseAndMintLP(
        address baseHolder,
        uint256 totalBaseInPool,
        uint256 amountInBaseToInvest
    ) internal {
        uint256 baseTokenDecimals = poolParameters.baseTokenDecimals;

        IERC20(poolParameters.baseToken).safeTransferFrom(
            baseHolder,
            address(this),
            amountInBaseToInvest.convertFrom18(baseTokenDecimals)
        );

        uint256 toMintLP = amountInBaseToInvest;

        if (totalBaseInPool > 0) {
            toMintLP = toMintLP.ratio(
                totalSupply(),
                totalBaseInPool.convertTo18(baseTokenDecimals)
            );
        }

        require(
            poolParameters.totalLPEmission == 0 ||
                totalEmission() + toMintLP <= poolParameters.totalLPEmission,
            "TP: minting more than emission allows"
        );

        _mint(_msgSender(), toMintLP);
    }

    function _checkLeverage(uint256 addInDAI) internal view {
        (uint256 totalPriceInDAI, uint256 traderPriceInDAI) = poolParameters
            .getLeveragePoolPriceInDAI(_openPositions, _priceFeed);
        (uint256 threshold, uint256 slope) = _coreProperties.getTraderLeverageParams();

        uint256 maxTraderVolumeInDAI = TraderPoolHelper.getMaxTraderLeverage(
            traderPriceInDAI,
            threshold,
            slope
        );

        require(
            addInDAI + totalPriceInDAI <= maxTraderVolumeInDAI,
            "TP: exchange exceeds leverage"
        );
    }

    function _updateInvestor(uint256 amountInBaseToInvest) internal {
        _investors.add(_msgSender());

        require(
            _investors.length() <= _coreProperties.getMaximumPoolInvestors(),
            "TP: max investors"
        );

        InvestorInfo memory oldInfo = investorsInfo[_msgSender()];

        investorsInfo[_msgSender()] = InvestorInfo(
            oldInfo.investedBase + amountInBaseToInvest,
            oldInfo.commissionUnlockEpoch == 0
                ? _nextCommissionEpoch()
                : oldInfo.commissionUnlockEpoch
        );
    }

    function _invest(address baseHolder, uint256 amountInBaseToInvest) internal {
        IPriceFeed priceFeed = _priceFeed;

        uint256 baseTokenDecimals = poolParameters.baseTokenDecimals;
        (
            uint256 totalBase,
            ,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = poolParameters.getPoolPrice(_openPositions, priceFeed);

        address baseToken = poolParameters.baseToken;
        uint256 baseConverted = amountInBaseToInvest.convertFrom18(baseTokenDecimals);

        if (!isTrader(_msgSender())) {
            _checkLeverage(priceFeed.getPriceInDAI(baseToken, baseConverted));
        }

        _transferBaseAndMintLP(baseHolder, totalBase, amountInBaseToInvest);

        for (uint256 i = 0; i < positionTokens.length; i++) {
            uint256 tokensToExchange = positionPricesInBase[i].ratio(baseConverted, totalBase);

            priceFeed.exchangeTo(baseToken, positionTokens[i], tokensToExchange);
        }

        if (!isTrader(_msgSender())) {
            _updateInvestor(amountInBaseToInvest);
        }
    }

    function invest(uint256 amountInBaseToInvest) public virtual {
        require(
            !poolParameters.privatePool ||
                isTraderAdmin(_msgSender()) ||
                isPrivateInvestor(_msgSender()),
            "TP: msg.sender is not allowed to invest"
        );
        require(amountInBaseToInvest > 0, "TP: zero investment");
        require(amountInBaseToInvest >= poolParameters.minimalInvestment, "TP: underinvestment");

        _invest(_msgSender(), amountInBaseToInvest);
    }

    function _nextCommissionEpoch() internal view returns (uint256) {
        return
            _coreProperties.getNextCommissionEpoch(
                block.timestamp,
                poolParameters.commissionPeriod
            );
    }

    function _calculateDexeCommission(
        uint256 baseToDistribute,
        uint256 lpToDistribute,
        uint256 dexePercentage
    ) internal returns (uint256 lpCommission, uint256 dexeCommission) {
        require(baseToDistribute > 0, "TP: no commission available");

        lpCommission = lpToDistribute.percentage(dexePercentage);

        uint256 baseCommission = baseToDistribute.percentage(dexePercentage).convertFrom18(
            poolParameters.baseTokenDecimals
        );

        dexeCommission = _priceFeed.exchangeTo(
            poolParameters.baseToken,
            address(_dexeToken),
            baseCommission
        );
    }

    function _distributeCommission(uint256 baseToDistribute, uint256 lpToDistribute) internal {
        (
            uint256 dexePercentage,
            uint256[] memory poolPercentages,
            address[3] memory commissionReceivers
        ) = _coreProperties.getDEXECommissionPercentages();

        (uint256 lpCommission, uint256 dexeCommission) = _calculateDexeCommission(
            baseToDistribute,
            lpToDistribute,
            dexePercentage
        );

        _mint(poolParameters.trader, lpToDistribute - lpCommission);

        uint256[] memory receivedCommissions = new uint256[](3);

        for (uint256 i = 0; i < commissionReceivers.length; i++) {
            receivedCommissions[i] = dexeCommission.percentage(poolPercentages[i]);
            _dexeToken.safeTransfer(commissionReceivers[i], receivedCommissions[i]);
        }

        uint256 insurance = uint256(ICoreProperties.CommissionTypes.INSURANCE);

        IInsurance(commissionReceivers[insurance]).receiveDexeFromPools(
            receivedCommissions[insurance]
        );
    }

    function reinvestCommission(uint256 offset, uint256 limit) external virtual onlyTraderAdmin {
        require(_openPositions.length() == 0, "TP: can't reinvest with opened positions");

        uint256 to = (offset + limit).min(_investors.length()).max(offset);
        uint256 totalSupply = totalSupply();

        uint256 nextCommissionEpoch = _nextCommissionEpoch();
        uint256 allBaseCommission;
        uint256 allLPCommission;

        for (uint256 i = offset; i < to; i++) {
            address investor = _investors.at(i);

            if (nextCommissionEpoch > investorsInfo[investor].commissionUnlockEpoch) {
                (
                    uint256 investorBaseAmount,
                    uint256 baseCommission,
                    uint256 lpCommission
                ) = _calculateCommissionOnReinvest(investor, totalSupply);

                investorsInfo[investor].commissionUnlockEpoch = nextCommissionEpoch;

                if (lpCommission > 0) {
                    investorsInfo[investor].investedBase = investorBaseAmount - baseCommission;

                    _burn(investor, lpCommission);

                    allBaseCommission += baseCommission;
                    allLPCommission += lpCommission;
                }
            }
        }

        _distributeCommission(allBaseCommission, allLPCommission);
    }

    function _calculateCommission(
        uint256 investorBaseAmount,
        uint256 investorLPAmount,
        uint256 investedBaseAmount
    ) internal view returns (uint256 baseCommission, uint256 lpCommission) {
        if (investorBaseAmount > investedBaseAmount) {
            baseCommission = (investorBaseAmount - investedBaseAmount).percentage(
                poolParameters.commissionPercentage
            );

            lpCommission = (investorLPAmount * baseCommission) / investorBaseAmount;
        }
    }

    function _calculateCommissionOnReinvest(address investor, uint256 oldTotalSupply)
        internal
        view
        returns (
            uint256 investorBaseAmount,
            uint256 baseCommission,
            uint256 lpCommission
        )
    {
        uint256 baseTokenBalance = ERC20(poolParameters.baseToken)
            .balanceOf(address(this))
            .convertTo18(poolParameters.baseTokenDecimals);

        investorBaseAmount = baseTokenBalance.ratio(balanceOf(investor), oldTotalSupply);

        (baseCommission, lpCommission) = _calculateCommission(
            investorBaseAmount,
            balanceOf(investor),
            investorsInfo[investor].investedBase
        );
    }

    function _calculateCommissionOnDivest(
        address investor,
        uint256 investorBaseAmount,
        uint256 amountLP
    ) internal view returns (uint256 baseCommission, uint256 lpCommission) {
        uint256 investedBaseConverted = investorsInfo[investor].investedBase.ratio(
            amountLP,
            balanceOf(investor)
        );

        (baseCommission, lpCommission) = _calculateCommission(
            investorBaseAmount,
            amountLP,
            investedBaseConverted
        );
    }

    function _divestPositions(uint256 amountLP) internal returns (uint256) {
        IERC20 baseToken = IERC20(poolParameters.baseToken);
        IPriceFeed priceFeed = _priceFeed;

        uint256 totalSupply = totalSupply();

        uint256 length = _openPositions.length();
        uint256 investorBaseAmount = baseToken.balanceOf(address(this)).ratio(
            amountLP,
            totalSupply
        );

        for (uint256 i = 0; i < length; i++) {
            ERC20 positionToken = ERC20(_openPositions.at(i));

            uint256 positionAmount = positionToken.balanceOf(address(this)).ratio(
                amountLP,
                totalSupply
            );

            investorBaseAmount += priceFeed.exchangeTo(
                address(positionToken),
                address(baseToken),
                positionAmount
            );
        }

        return investorBaseAmount.convertTo18(poolParameters.baseTokenDecimals);
    }

    function _divestInvestor(uint256 amountLP) internal {
        uint256 investorBaseAmount = _divestPositions(amountLP);

        (uint256 baseCommission, uint256 lpCommission) = _calculateCommissionOnDivest(
            _msgSender(),
            investorBaseAmount,
            amountLP
        );

        _updateFrom(_msgSender(), amountLP);
        _burn(_msgSender(), amountLP);

        IERC20(poolParameters.baseToken).safeTransfer(
            _msgSender(),
            (investorBaseAmount - baseCommission).convertFrom18(poolParameters.baseTokenDecimals)
        );

        if (baseCommission > 0) {
            _distributeCommission(baseCommission, lpCommission);
        }
    }

    function _divestTrader(uint256 amountLP) internal {
        IERC20 baseToken = IERC20(poolParameters.baseToken);

        uint256 traderBaseAmount = baseToken.balanceOf(address(this)).ratio(
            amountLP,
            totalSupply()
        );

        _burn(_msgSender(), amountLP);

        baseToken.safeTransfer(_msgSender(), traderBaseAmount);
    }

    function divest(uint256 amountLP) public virtual {
        require(!isTrader(_msgSender()) || _openPositions.length() == 0, "TP: can't divest");
        require(amountLP <= balanceOf(_msgSender()), "TP: can't divest that amount");

        if (isTrader(_msgSender())) {
            _divestTrader(amountLP);
        } else {
            _divestInvestor(amountLP);
        }
    }

    function divestAll() public virtual {
        divest(balanceOf(_msgSender()));
    }

    function exchange(
        address from,
        address to,
        uint256 amount
    ) public virtual onlyTraderAdmin {
        require(
            from == poolParameters.baseToken || _openPositions.contains(from),
            "TP: invalid exchange address"
        );

        uint256 convertedAmount = amount.convertFrom18(ERC20(from).decimals());

        require(
            convertedAmount <= ERC20(from).balanceOf(address(this)),
            "TP: invalid exchange amount"
        );

        _checkPriceFeedAllowance(from);
        _checkPriceFeedAllowance(to);

        if (from == poolParameters.baseToken || to != poolParameters.baseToken) {
            _openPositions.add(to);
        }

        _priceFeed.exchangeTo(from, to, convertedAmount);

        if (ERC20(from).balanceOf(address(this)) == 0) {
            _openPositions.remove(from);
        }
    }

    function _checkPriceFeedAllowance(address token) internal {
        if (IERC20(token).allowance(address(this), address(_priceFeed)) == 0) {
            IERC20(token).safeApprove(address(_priceFeed), MAX_UINT);
        }
    }

    function _updateFrom(address investor, uint256 lpAmount)
        internal
        returns (uint256 baseTransfer)
    {
        baseTransfer = investorsInfo[investor].investedBase.ratio(lpAmount, balanceOf(investor));

        if (lpAmount == balanceOf(investor)) {
            _investors.remove(investor);
            investorsInfo[investor].commissionUnlockEpoch = 0;
        }

        investorsInfo[investor].investedBase -= baseTransfer;
    }

    function _updateTo(address investor, uint256 baseAmount) internal {
        if (balanceOf(investor) == 0) {
            _investors.add(investor);
            investorsInfo[investor].commissionUnlockEpoch = _nextCommissionEpoch();

            require(
                _investors.length() <= _coreProperties.getMaximumPoolInvestors(),
                "TP: max investors"
            );
        }

        investorsInfo[investor].investedBase += baseAmount;
    }

    /// @notice if trader transfers tokens to an investor, we will count them as "earned" and add to the commission calculation
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        require(amount > 0, "TP: 0 transfer");
        require(
            !poolParameters.privatePool || isTraderAdmin(to) || isPrivateInvestor(to),
            "TP: prohibited transfer"
        );

        if (from != address(0) && to != address(0)) {
            uint256 baseTransfer; // intended to be zero if sender is a trader

            if (!isTrader(from)) {
                baseTransfer = _updateFrom(from, amount);
            }

            if (!isTrader(to)) {
                _updateTo(to, baseTransfer);
            }
        }
    }
}
