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
import "../interfaces/insurance/IInsurance.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../proxy/contracts-registry/AbstractDependant.sol";

import "../libs/PriceFeed/PriceFeedLocal.sol";
import "../libs/TraderPool/TraderPoolPrice.sol";
import "../libs/TraderPool/TraderPoolLeverage.sol";
import "../libs/TraderPool/TraderPoolCommission.sol";
import "../libs/TraderPool/TraderPoolView.sol";
import "../libs/TokenBalance.sol";
import "../libs/DecimalsConverter.sol";
import "../libs/MathHelper.sol";

import "../core/Globals.sol";

abstract contract TraderPool is ITraderPool, ERC20Upgradeable, AbstractDependant {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;
    using Math for uint256;
    using DecimalsConverter for uint256;
    using TraderPoolPrice for PoolParameters;
    using TraderPoolPrice for address;
    using TraderPoolLeverage for PoolParameters;
    using TraderPoolCommission for PoolParameters;
    using TraderPoolView for PoolParameters;
    using MathHelper for uint256;
    using PriceFeedLocal for IPriceFeed;
    using TokenBalance for address;

    IERC20 internal _dexeToken;
    IPriceFeed public override priceFeed;
    ICoreProperties public override coreProperties;

    mapping(address => bool) internal _traderAdmins;

    PoolParameters internal _poolParameters;

    EnumerableSet.AddressSet internal _privateInvestors;
    EnumerableSet.AddressSet internal _investors;
    EnumerableSet.AddressSet internal _openPositions;

    mapping(address => mapping(uint256 => uint256)) internal _investsInBlocks; // user => block => LP amount

    mapping(address => InvestorInfo) public investorsInfo;

    event Exchanged(address fromToken, address toToken, uint256 fromVolume, uint256 toVolume);
    event PositionClosed(address position);
    event InvestorAdded(address investor);
    event Invested(address investor, uint256 amount, uint256 toMintLP); // check
    event InvestorRemoved(address investor);
    event Divested(address investor, uint256 amount, uint256 commission);
    event TraderCommissionMinted(address trader, uint256 amount);
    event TraderCommissionPaid(address investor, uint256 amount);
    event DescriptionURLChanged(string descriptionURL);
    event ModifiedAdmins(address[] admins, bool add);

    modifier onlyTraderAdmin() {
        _onlyTraderAdmin();
        _;
    }

    function _onlyTraderAdmin() internal view {
        require(isTraderAdmin(msg.sender), "TP: not an admin");
    }

    modifier onlyTrader() {
        _onlyTrader();
        _;
    }

    function _onlyTrader() internal view {
        require(isTrader(msg.sender), "TP: not a trader");
    }

    modifier checkUserBalance(uint256 amountLP) {
        _checkUserBalance(amountLP);
        _;
    }

    function _checkUserBalance(uint256 amountLP) internal view {
        require(
            amountLP <= balanceOf(msg.sender) - _investsInBlocks[msg.sender][block.number],
            "TP: wrong amount"
        );
    }

    modifier checkThisBalance(uint256 amount, address token) {
        _checkThisBalance(amount, token);
        _;
    }

    function _checkThisBalance(uint256 amount, address token) internal view {
        require(amount <= token.normThisBalance(), "TP: invalid exchange amount");
    }

    function isPrivateInvestor(address who) public view override returns (bool) {
        return _privateInvestors.contains(who);
    }

    function isTraderAdmin(address who) public view override returns (bool) {
        return _traderAdmins[who];
    }

    function isTrader(address who) public view override returns (bool) {
        return _poolParameters.trader == who;
    }

    function __TraderPool_init(
        string calldata name,
        string calldata symbol,
        PoolParameters calldata poolParameters
    ) public onlyInitializing {
        __ERC20_init(name, symbol);

        _poolParameters = poolParameters;
        _traderAdmins[poolParameters.trader] = true;
        address[] memory admins = new address[](1);
        admins[0] = poolParameters.trader;
        emit ModifiedAdmins(admins, true);
    }

    function setDependencies(address contractsRegistry) public virtual override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        _dexeToken = IERC20(registry.getDEXEContract());
        priceFeed = IPriceFeed(registry.getPriceFeedContract());
        coreProperties = ICoreProperties(registry.getCorePropertiesContract());
    }

    function modifyAdmins(address[] calldata admins, bool add) external override onlyTraderAdmin {
        for (uint256 i = 0; i < admins.length; i++) {
            _traderAdmins[admins[i]] = add;
        }

        _traderAdmins[_poolParameters.trader] = true;

        emit ModifiedAdmins(admins, add);
    }

    function modifyPrivateInvestors(address[] calldata privateInvestors, bool add)
        external
        override
        onlyTraderAdmin
    {
        for (uint256 i = 0; i < privateInvestors.length; i++) {
            _privateInvestors.add(privateInvestors[i]);

            if (!add && balanceOf(privateInvestors[i]) == 0) {
                _privateInvestors.remove(privateInvestors[i]);
            }
        }
    }

    function changePoolParameters(
        string calldata descriptionURL,
        bool privatePool,
        uint256 totalLPEmission,
        uint256 minimalInvestment
    ) external override onlyTraderAdmin {
        require(
            totalLPEmission == 0 || totalEmission() <= totalLPEmission,
            "TP: wrong emission supply"
        );
        require(
            !privatePool || (privatePool && _investors.length() == 0),
            "TP: pool is not empty"
        );

        _poolParameters.descriptionURL = descriptionURL;
        _poolParameters.privatePool = privatePool;
        _poolParameters.totalLPEmission = totalLPEmission;
        _poolParameters.minimalInvestment = minimalInvestment;

        emit DescriptionURLChanged(descriptionURL);
    }

    function totalOpenPositions() external view override returns (uint256) {
        return _openPositions.length();
    }

    function totalInvestors() external view override returns (uint256) {
        return _investors.length();
    }

    function proposalPoolAddress() external view virtual override returns (address);

    function totalEmission() public view virtual override returns (uint256);

    function getUsersInfo(uint256 offset, uint256 limit)
        external
        view
        override
        returns (UserInfo[] memory usersInfo)
    {
        return _poolParameters.getUsersInfo(_openPositions, _investors, offset, limit);
    }

    function getPoolInfo() external view override returns (PoolInfo memory poolInfo) {
        return _poolParameters.getPoolInfo(_openPositions);
    }

    function _transferBaseAndMintLP(
        address baseHolder,
        uint256 totalBaseInPool,
        uint256 amountInBaseToInvest
    ) internal returns (uint256) {
        IERC20(_poolParameters.baseToken).safeTransferFrom(
            baseHolder,
            address(this),
            amountInBaseToInvest.convertFrom18(_poolParameters.baseTokenDecimals)
        );

        uint256 toMintLP = amountInBaseToInvest;

        if (totalBaseInPool > 0) {
            toMintLP = toMintLP.ratio(totalSupply(), totalBaseInPool);
        }

        require(
            _poolParameters.totalLPEmission == 0 ||
                totalEmission() + toMintLP <= _poolParameters.totalLPEmission,
            "TP: minting > emission"
        );

        _investsInBlocks[msg.sender][block.number] += toMintLP;
        _mint(msg.sender, toMintLP);

        return toMintLP;
    }

    function getLeverageInfo() external view override returns (LeverageInfo memory leverageInfo) {
        return _poolParameters.getLeverageInfo(_openPositions);
    }

    function getInvestTokens(uint256 amountInBaseToInvest)
        external
        view
        override
        returns (Receptions memory receptions)
    {
        return _poolParameters.getInvestTokens(_openPositions, amountInBaseToInvest);
    }

    function _invest(
        address baseHolder,
        uint256 amountInBaseToInvest,
        uint256[] calldata minPositionsOut
    ) internal returns (uint256) {
        (
            uint256 totalBase,
            ,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = _poolParameters.getNormalizedPoolPriceAndPositions(_openPositions);

        address baseToken = _poolParameters.baseToken;

        _poolParameters.checkLeverage(_openPositions, amountInBaseToInvest);
        uint256 toMintLP = _transferBaseAndMintLP(baseHolder, totalBase, amountInBaseToInvest);

        for (uint256 i = 0; i < positionTokens.length; i++) {
            priceFeed.normExchangeFromExact(
                baseToken,
                positionTokens[i],
                positionPricesInBase[i].ratio(amountInBaseToInvest, totalBase),
                new address[](0),
                minPositionsOut[i]
            );
        }

        _updateTo(msg.sender, amountInBaseToInvest);

        return toMintLP;
    }

    function invest(uint256 amountInBaseToInvest, uint256[] calldata minPositionsOut)
        public
        virtual
        override
    {
        require(amountInBaseToInvest > 0, "TP: zero investment");
        require(amountInBaseToInvest >= _poolParameters.minimalInvestment, "TP: underinvestment");

        uint256 toMintLP = _invest(msg.sender, amountInBaseToInvest, minPositionsOut);

        emit Invested(msg.sender, amountInBaseToInvest, toMintLP);
    }

    function _distributeCommission(
        uint256 baseToDistribute,
        uint256 lpToDistribute,
        uint256 minDexeCommissionOut
    ) internal {
        require(baseToDistribute > 0, "TP: no commission available");

        (
            uint256 dexePercentage,
            uint256[] memory poolPercentages,
            address[3] memory commissionReceivers
        ) = coreProperties.getDEXECommissionPercentages();

        (uint256 dexeLPCommission, uint256 dexeBaseCommission) = TraderPoolCommission
            .calculateDexeCommission(baseToDistribute, lpToDistribute, dexePercentage);
        uint256 dexeCommission = priceFeed.normExchangeFromExact(
            _poolParameters.baseToken,
            address(_dexeToken),
            dexeBaseCommission,
            new address[](0),
            minDexeCommissionOut
        );

        _mint(_poolParameters.trader, lpToDistribute - dexeLPCommission);
        TraderPoolCommission.sendDexeCommission(
            _dexeToken,
            dexeCommission,
            poolPercentages,
            commissionReceivers
        );

        emit TraderCommissionMinted(_poolParameters.trader, lpToDistribute - dexeLPCommission);
    }

    function getReinvestCommissions(uint256 offset, uint256 limit)
        external
        view
        override
        returns (Commissions memory commissions)
    {
        return _poolParameters.getReinvestCommissions(_investors, offset, limit);
    }

    function getNextCommissionEpoch() public view returns (uint256) {
        return _poolParameters.nextCommissionEpoch();
    }

    function reinvestCommission(
        uint256 offset,
        uint256 limit,
        uint256 minDexeCommissionOut
    ) external virtual override onlyTraderAdmin {
        require(_openPositions.length() == 0, "TP: positions are open");

        uint256 to = (offset + limit).min(_investors.length()).max(offset);
        uint256 totalSupply = totalSupply();

        uint256 nextCommissionEpoch = getNextCommissionEpoch();
        uint256 allBaseCommission;
        uint256 allLPCommission;

        for (uint256 i = offset; i < to; i++) {
            address investor = _investors.at(i);
            InvestorInfo storage info = investorsInfo[investor];

            if (nextCommissionEpoch > info.commissionUnlockEpoch) {
                (
                    uint256 investorBaseAmount,
                    uint256 baseCommission,
                    uint256 lpCommission
                ) = _poolParameters.calculateCommissionOnReinvest(investor, totalSupply);

                info.commissionUnlockEpoch = nextCommissionEpoch;

                if (lpCommission > 0) {
                    info.investedBase = investorBaseAmount - baseCommission;

                    _burn(investor, lpCommission);

                    emit TraderCommissionPaid(investor, lpCommission);

                    allBaseCommission += baseCommission;
                    allLPCommission += lpCommission;
                }
            }
        }

        _distributeCommission(allBaseCommission, allLPCommission, minDexeCommissionOut);
    }

    function _divestPositions(uint256 amountLP, uint256[] calldata minPositionsOut)
        internal
        checkUserBalance(amountLP)
        returns (uint256 investorBaseAmount)
    {
        address baseToken = _poolParameters.baseToken;
        uint256 totalSupply = totalSupply();
        uint256 length = _openPositions.length();

        investorBaseAmount = baseToken.normThisBalance().ratio(amountLP, totalSupply);

        for (uint256 i = 0; i < length; i++) {
            address positionToken = _openPositions.at(i);

            investorBaseAmount += priceFeed.normExchangeFromExact(
                positionToken,
                baseToken,
                positionToken.normThisBalance().ratio(amountLP, totalSupply),
                new address[](0),
                minPositionsOut[i]
            );
        }
    }

    function _divestInvestor(
        uint256 amountLP,
        uint256[] calldata minPositionsOut,
        uint256 minDexeCommissionOut
    ) internal returns (uint256) {
        uint256 investorBaseAmount = _divestPositions(amountLP, minPositionsOut);

        (uint256 baseCommission, uint256 lpCommission) = _poolParameters
            .calculateCommissionOnDivest(msg.sender, investorBaseAmount, amountLP);

        _updateFrom(msg.sender, amountLP);
        _burn(msg.sender, amountLP);

        IERC20(_poolParameters.baseToken).safeTransfer(
            msg.sender,
            (investorBaseAmount - baseCommission).convertFrom18(_poolParameters.baseTokenDecimals)
        );

        if (baseCommission > 0) {
            _distributeCommission(baseCommission, lpCommission, minDexeCommissionOut);
        }

        return baseCommission;
    }

    function _divestTrader(uint256 amountLP) internal checkUserBalance(amountLP) {
        IERC20 baseToken = IERC20(_poolParameters.baseToken);
        uint256 traderBaseAmount = address(baseToken).thisBalance().ratio(amountLP, totalSupply());

        _burn(msg.sender, amountLP);
        baseToken.safeTransfer(msg.sender, traderBaseAmount);
    }

    function getDivestAmountsAndCommissions(address user, uint256 amountLP)
        external
        view
        override
        returns (Receptions memory receptions, Commissions memory commissions)
    {
        return _poolParameters.getDivestAmountsAndCommissions(_openPositions, user, amountLP);
    }

    function divest(
        uint256 amountLP,
        uint256[] calldata minPositionsOut,
        uint256 minDexeCommissionOut
    ) public virtual override {
        bool senderTrader = isTrader(msg.sender);
        require(!senderTrader || _openPositions.length() == 0, "TP: can't divest");

        uint256 baseCommission;

        if (senderTrader) {
            _divestTrader(amountLP);
        } else {
            baseCommission = _divestInvestor(amountLP, minPositionsOut, minDexeCommissionOut);
        }

        emit Divested(msg.sender, amountLP, baseCommission);
    }

    function _exchange(
        address from,
        address to,
        uint256 amount,
        uint256 amountBound,
        address[] calldata optionalPath,
        bool fromExact
    ) internal {
        require(from != to, "TP: ambiguous exchange");
        require(
            from == _poolParameters.baseToken || _openPositions.contains(from),
            "TP: invalid exchange address"
        );

        priceFeed.checkAllowance(from);
        priceFeed.checkAllowance(to);

        if (to != _poolParameters.baseToken) {
            _openPositions.add(to);
        }

        uint256 amountGot;

        if (fromExact) {
            amountGot = priceFeed.normExchangeFromExact(
                from,
                to,
                amount,
                optionalPath,
                amountBound
            );
        } else {
            amountGot = priceFeed.normExchangeToExact(from, to, amount, optionalPath, amountBound);

            (amount, amountGot) = (amountGot, amount);
        }

        emit Exchanged(from, to, amount, amountGot);

        if (from != _poolParameters.baseToken && from.thisBalance() == 0) {
            _openPositions.remove(from);

            emit PositionClosed(from);
        }
    }

    function _getExchangeAmount(
        address from,
        address to,
        uint256 amount,
        address[] calldata optionalPath,
        bool fromExact
    ) internal view returns (uint256, address[] memory) {
        return
            _poolParameters.getExchangeAmount(
                _openPositions,
                from,
                to,
                amount,
                optionalPath,
                fromExact
            );
    }

    function getExchangeFromExactAmount(
        address from,
        address to,
        uint256 amountIn,
        address[] calldata optionalPath
    ) external view override returns (uint256 minAmountOut, address[] memory path) {
        return _getExchangeAmount(from, to, amountIn, optionalPath, true);
    }

    function exchangeFromExact(
        address from,
        address to,
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata optionalPath
    ) public virtual override onlyTraderAdmin checkThisBalance(amountIn, from) {
        _exchange(from, to, amountIn, minAmountOut, optionalPath, true);
    }

    function getExchangeToExactAmount(
        address from,
        address to,
        uint256 amountOut,
        address[] calldata optionalPath
    ) external view override returns (uint256 maxAmountIn, address[] memory path) {
        return _getExchangeAmount(from, to, amountOut, optionalPath, false);
    }

    function exchangeToExact(
        address from,
        address to,
        uint256 amountOut,
        uint256 maxAmountIn,
        address[] calldata optionalPath
    ) public virtual override onlyTraderAdmin checkThisBalance(maxAmountIn, from) {
        _exchange(from, to, amountOut, maxAmountIn, optionalPath, false);
    }

    function _updateFromData(address investor, uint256 lpAmount)
        internal
        returns (uint256 baseTransfer)
    {
        if (!isTrader(investor)) {
            InvestorInfo storage info = investorsInfo[investor];

            baseTransfer = info.investedBase.ratio(lpAmount, balanceOf(investor));
            info.investedBase -= baseTransfer;
        }
    }

    function _updateToData(address investor, uint256 baseAmount) internal {
        if (!isTrader(investor)) {
            investorsInfo[investor].investedBase += baseAmount;
        }
    }

    function _checkRemoveInvestor(address investor, uint256 lpAmount) internal {
        if (!isTrader(investor) && lpAmount == balanceOf(investor)) {
            _investors.remove(investor);
            investorsInfo[investor].commissionUnlockEpoch = 0;

            emit InvestorRemoved(investor);
        }
    }

    function _checkNewInvestor(address investor) internal {
        require(
            !_poolParameters.privatePool || isTraderAdmin(investor) || isPrivateInvestor(investor),
            "TP: private pool"
        );

        if (!isTrader(investor) && !_investors.contains(investor)) {
            _investors.add(investor);
            investorsInfo[investor].commissionUnlockEpoch = getNextCommissionEpoch();

            require(
                _investors.length() <= coreProperties.getMaximumPoolInvestors(),
                "TP: max investors"
            );

            emit InvestorAdded(investor);
        }
    }

    function _updateFrom(address investor, uint256 lpAmount)
        internal
        returns (uint256 baseTransfer)
    {
        _checkRemoveInvestor(investor, lpAmount);
        return _updateFromData(investor, lpAmount);
    }

    function _updateTo(address investor, uint256 baseAmount) internal {
        _checkNewInvestor(investor);
        _updateToData(investor, baseAmount);
    }

    /// @notice if trader transfers tokens to an investor, we will count them as "earned" and add to the commission calculation
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        require(amount > 0, "TP: 0 transfer");

        if (from != address(0) && to != address(0) && from != to) {
            uint256 baseTransfer = _updateFrom(from, amount); // intended to be zero if sender is a trader
            _updateTo(to, baseTransfer);
        }
    }
}
