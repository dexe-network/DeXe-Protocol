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

import "../libs/TraderPool/TraderPoolPrice.sol";
import "../libs/TraderPool/TraderPoolLeverage.sol";
import "../libs/TraderPool/TraderPoolCommission.sol";
import "../libs/TraderPool/TraderPoolView.sol";
import "../libs/DecimalsConverter.sol";
import "../libs/MathHelper.sol";

import "../helpers/AbstractDependant.sol";
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
    event Invest(address investor, uint256 amount, uint256 lpPurchasePrice);
    event InvestorRemoved(address investor);
    event Divest(address investor, uint256 amount, uint256 commission);

    event Exchanged(address fromToken, address toToken, uint256 fromVolume, uint256 toVolume);
    event PositionClosed(address position);
    event InvestorAdded(address investor);
    event Invest(address investor, uint256 amount, uint256 toMintLP);
    event InvestorRemoved(address investor);
    event Divest(address investor, uint256 amount, uint256 commission);
    event MintLP(address trader, uint256 amount);
    event BurnLP(address trader, uint256 amount);

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
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        public
        virtual
        override
        dependant
    {
        _dexeToken = IERC20(contractsRegistry.getDEXEContract());
        priceFeed = IPriceFeed(contractsRegistry.getPriceFeedContract());
        coreProperties = ICoreProperties(contractsRegistry.getCorePropertiesContract());
    }

    function modifyAdmins(address[] calldata admins, bool add) external override onlyTraderAdmin {
        for (uint256 i = 0; i < admins.length; i++) {
            _traderAdmins[admins[i]] = add;
        }

        _traderAdmins[_poolParameters.trader] = true;
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
    ) internal {
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
    ) internal {
        (
            uint256 totalBase,
            ,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = _poolParameters.getNormalizedPoolPrice(_openPositions);

        address baseToken = _poolParameters.baseToken;

        _poolParameters.checkLeverage(_openPositions, amountInBaseToInvest);
        _transferBaseAndMintLP(baseHolder, totalBase, amountInBaseToInvest);

        for (uint256 i = 0; i < positionTokens.length; i++) {
            _normalizedExchangeFromExact(
                baseToken,
                positionTokens[i],
                positionPricesInBase[i].ratio(amountInBaseToInvest, totalBase),
                new address[](0),
                minPositionsOut[i]
            );
        }

        _updateTo(msg.sender, amountInBaseToInvest);
    }

    function invest(uint256 amountInBaseToInvest, uint256[] calldata minPositionsOut)
        public
        virtual
        override
    {
        require(amountInBaseToInvest > 0, "TP: zero investment");
        require(amountInBaseToInvest >= _poolParameters.minimalInvestment, "TP: underinvestment");

        _invest(msg.sender, amountInBaseToInvest, minPositionsOut);
    }

    function _sendDexeCommission(
        uint256 dexeCommission,
        uint256[] memory poolPercentages,
        address[3] memory commissionReceivers
    ) internal {
        uint256[] memory receivedCommissions = new uint256[](3);
        uint256 dexeDecimals = ERC20(address(_dexeToken)).decimals();

        for (uint256 i = 0; i < commissionReceivers.length; i++) {
            receivedCommissions[i] = dexeCommission.percentage(poolPercentages[i]);
            _dexeToken.safeTransfer(
                commissionReceivers[i],
                receivedCommissions[i].convertFrom18(dexeDecimals)
            );
        }

        uint256 insurance = uint256(ICoreProperties.CommissionTypes.INSURANCE);

        IInsurance(commissionReceivers[insurance]).receiveDexeFromPools(
            receivedCommissions[insurance]
        );
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
        uint256 dexeCommission = _normalizedExchangeFromExact(
            _poolParameters.baseToken,
            address(_dexeToken),
            dexeBaseCommission,
            new address[](0),
            minDexeCommissionOut
        );

        _mint(_poolParameters.trader, lpToDistribute - dexeLPCommission);
        _sendDexeCommission(dexeCommission, poolPercentages, commissionReceivers);
    }

    function getReinvestCommissions(uint256 offset, uint256 limit)
        external
        view
        override
        returns (Commissions memory commissions)
    {
        return _poolParameters.getReinvestCommissions(_investors, offset, limit);
    }

    function reinvestCommission(
        uint256 offset,
        uint256 limit,
        uint256 minDexeCommissionOut
    ) external virtual override onlyTraderAdmin {
        require(_openPositions.length() == 0, "TP: positions are open");

        uint256 to = (offset + limit).min(_investors.length()).max(offset);
        uint256 totalSupply = totalSupply();

        uint256 nextCommissionEpoch = _nextCommissionEpoch();
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
                    emit BurnLP(investor, lpCommission);

                    allBaseCommission += baseCommission;
                    allLPCommission += lpCommission;
                }
            }
        }

        _distributeCommission(allBaseCommission, allLPCommission, minDexeCommissionOut);
    }

    function _divestPositions(uint256 amountLP, uint256[] calldata minPositionsOut)
        internal
        returns (uint256 investorBaseAmount)
    {
        require(
            amountLP <= balanceOf(msg.sender) - _investsInBlocks[msg.sender][block.number],
            "TP: wrong amount"
        );

        address baseToken = _poolParameters.baseToken;
        uint256 totalSupply = totalSupply();
        uint256 length = _openPositions.length();

        investorBaseAmount = _normalizedBalance(baseToken).ratio(amountLP, totalSupply);

        for (uint256 i = 0; i < length; i++) {
            address positionToken = _openPositions.at(i);

            investorBaseAmount += _normalizedExchangeFromExact(
                positionToken,
                baseToken,
                _normalizedBalance(positionToken).ratio(amountLP, totalSupply),
                new address[](0),
                minPositionsOut[i]
            );
        }
    }

    function _divestInvestor(
        uint256 amountLP,
        uint256[] calldata minPositionsOut,
        uint256 minDexeCommissionOut
    ) internal {
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
    }

    function _divestTrader(uint256 amountLP) internal {
        require(
            amountLP <= balanceOf(msg.sender) - _investsInBlocks[msg.sender][block.number],
            "TP: wrong amount"
        );

        IERC20 baseToken = IERC20(_poolParameters.baseToken);
        uint256 traderBaseAmount = _thisBalance(address(baseToken)).ratio(amountLP, totalSupply());

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

        if (senderTrader) {
            _divestTrader(amountLP);
        } else {
            _divestInvestor(amountLP, minPositionsOut, minDexeCommissionOut);
        }

        emit Divest(_msgSender(), amountLP, minDexeCommissionOut);
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

        _checkPriceFeedAllowance(from);
        _checkPriceFeedAllowance(to);

        if (from == _poolParameters.baseToken || to != _poolParameters.baseToken) {
            _openPositions.add(to);
        }

        if (fromExact) {
            _normalizedExchangeFromExact(from, to, amount, optionalPath, amountBound);
        } else {
            priceFeed.normalizedExchangeToExact(from, to, amount, optionalPath, amountBound);
        }

        if (_thisBalance(from) == 0) {
            _openPositions.remove(from);
            emit PositionClosed(from);
        }

        emit Exchanged(from, to, amount, amountBound);
    }

    function _getExchangeAmount(
        address from,
        address to,
        uint256 amount,
        address[] calldata optionalPath,
        bool fromExact
    ) internal view returns (uint256) {
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
    ) external view override returns (uint256 minAmountOut) {
        return _getExchangeAmount(from, to, amountIn, optionalPath, true);
    }

    function exchangeFromExact(
        address from,
        address to,
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata optionalPath
    ) public virtual override onlyTraderAdmin {
        require(amountIn <= _normalizedBalance(from), "TP: invalid exchange amount");

        _exchange(from, to, amountIn, minAmountOut, optionalPath, true);
    }

    function getExchangeToExactAmount(
        address from,
        address to,
        uint256 amountOut,
        address[] calldata optionalPath
    ) external view override returns (uint256 maxAmountIn) {
        return _getExchangeAmount(from, to, amountOut, optionalPath, false);
    }

    function exchangeToExact(
        address from,
        address to,
        uint256 amountOut,
        uint256 maxAmountIn,
        address[] calldata optionalPath
    ) public virtual override onlyTraderAdmin {
        require(maxAmountIn <= _normalizedBalance(from), "TP: invalid exchange amount");

        _exchange(from, to, amountOut, maxAmountIn, optionalPath, false);
    }

    function _nextCommissionEpoch() internal view returns (uint256) {
        return _poolParameters.nextCommissionEpoch();
    }

    function _normalizedBalance(address token) internal view returns (uint256) {
        return token.getNormalizedBalance();
    }

    function _normalizedExchangeFromExact(
        address inToken,
        address outToken,
        uint256 amountIn,
        address[] memory optionalPath,
        uint256 minAmountOut
    ) internal returns (uint256) {
        return
            priceFeed.normalizedExchangeFromExact(
                inToken,
                outToken,
                amountIn,
                optionalPath,
                minAmountOut
            );
    }

    function _thisBalance(address token) internal view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function _checkPriceFeedAllowance(address token) internal {
        if (IERC20(token).allowance(address(this), address(priceFeed)) == 0) {
            IERC20(token).safeApprove(address(priceFeed), MAX_UINT);
        }
    }

    function _updateFromData(address investor, uint256 lpAmount)
        internal
        returns (uint256 baseTransfer)
    {
        InvestorInfo storage info = investorsInfo[investor];

        baseTransfer = info.investedBase.ratio(lpAmount, balanceOf(investor));
        info.investedBase -= baseTransfer;
    }

    function _checkRemoveInvestor(address investor, uint256 lpAmount) internal {
        if (lpAmount == balanceOf(investor)) {
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

        if (!_investors.contains(investor)) {
            _investors.add(investor);
            investorsInfo[investor].commissionUnlockEpoch = _nextCommissionEpoch();

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
        if (!isTrader(investor)) {
            _checkRemoveInvestor(investor, lpAmount);
            return _updateFromData(investor, lpAmount);
        }
    }

    function _updateTo(address investor, uint256 baseAmount) internal {
        if (!isTrader(investor)) {
            _checkNewInvestor(investor);
            investorsInfo[investor].investedBase += baseAmount;
        }
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
