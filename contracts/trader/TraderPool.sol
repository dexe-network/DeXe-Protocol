// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@dlsl/dev-modules/contracts-registry/AbstractDependant.sol";

import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/core/ISBT721.sol";

import "../libs/trader-pool/TraderPoolCommission.sol";
import "../libs/trader-pool/TraderPoolExchange.sol";
import "../libs/trader-pool/TraderPoolView.sol";
import "../libs/trader-pool/TraderPoolModify.sol";
import "../libs/trader-pool/TraderPoolInvest.sol";
import "../libs/trader-pool/TraderPoolDivest.sol";
import "../libs/math/MathHelper.sol";

abstract contract TraderPool is
    ITraderPool,
    ERC20Upgradeable,
    ReentrancyGuardUpgradeable,
    AbstractDependant
{
    using EnumerableSet for EnumerableSet.AddressSet;
    using MathHelper for uint256;
    using TraderPoolCommission for *;
    using TraderPoolExchange for *;
    using TraderPoolModify for *;
    using TraderPoolInvest for *;
    using TraderPoolDivest for *;
    using TraderPoolView for *;

    IERC20 public override dexeToken;
    IPriceFeed public override priceFeed;
    ICoreProperties public override coreProperties;
    ISBT721 internal _babt;

    EnumerableSet.AddressSet internal _traderAdmins;

    PoolParameters internal _poolParameters;

    EnumerableSet.AddressSet internal _privateInvestors;
    EnumerableSet.AddressSet internal _investors;
    EnumerableSet.AddressSet internal _positions;

    mapping(address => uint256) public latestInvestBlocks; // user => block
    mapping(address => InvestorInfo) public investorsInfo;

    modifier onlyTraderAdmin() {
        _onlyTraderAdmin();
        _;
    }

    modifier onlyTrader() {
        _onlyTrader();
        _;
    }

    modifier onlyThis() {
        _onlyThis();
        _;
    }

    modifier onlyBABTHolder() {
        _onlyBABTHolder();
        _;
    }

    function setDependencies(address contractsRegistry) public virtual override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        dexeToken = IERC20(registry.getDEXEContract());
        priceFeed = IPriceFeed(registry.getPriceFeedContract());
        coreProperties = ICoreProperties(registry.getCorePropertiesContract());
        _babt = ISBT721(registry.getBABTContract());
    }

    function divest(
        uint256 amountLP,
        uint256[] calldata minPositionsOut,
        uint256 minDexeCommissionOut
    ) public virtual override onlyBABTHolder {
        _poolParameters.divest(amountLP, minPositionsOut, minDexeCommissionOut);
    }

    function exchange(
        address from,
        address to,
        uint256 amount,
        uint256 amountBound,
        address[] calldata optionalPath,
        ExchangeType exType
    ) public virtual override onlyTraderAdmin onlyBABTHolder {
        _poolParameters.exchange(_positions, from, to, amount, amountBound, optionalPath, exType);
    }

    function __TraderPool_init(
        string calldata name,
        string calldata symbol,
        PoolParameters calldata poolParameters
    ) public override onlyInitializing {
        __ERC20_init(name, symbol);
        __ReentrancyGuard_init();

        _poolParameters = poolParameters;
        _traderAdmins.add(poolParameters.trader);
    }

    function modifyAdmins(
        address[] calldata admins,
        bool add
    ) external override onlyTraderAdmin onlyBABTHolder {
        _traderAdmins.modifyAdmins(_poolParameters, admins, add);
    }

    function modifyPrivateInvestors(
        address[] calldata privateInvestors,
        bool add
    ) external override onlyTraderAdmin onlyBABTHolder {
        _privateInvestors.modifyPrivateInvestors(privateInvestors, add);
    }

    function changePoolParameters(
        string calldata descriptionURL,
        bool onlyBABTHolders,
        bool privatePool,
        uint256 totalLPEmission,
        uint256 minimalInvestment
    ) external override onlyTraderAdmin onlyBABTHolder {
        _poolParameters.changePoolParameters(
            _investors,
            descriptionURL,
            onlyBABTHolders,
            privatePool,
            totalLPEmission,
            minimalInvestment
        );
    }

    function invest(
        uint256 amountInBaseToInvest,
        uint256[] calldata minPositionsOut
    ) public virtual override onlyBABTHolder {
        _poolParameters.invest(amountInBaseToInvest, minPositionsOut);
    }

    function investInitial(
        uint256[] calldata amounts,
        address[] calldata tokens,
        uint256 minLPOut
    ) public virtual override onlyTraderAdmin onlyBABTHolder {
        require(_investors.length() == 0, "TP: only empty pool");

        _poolParameters.investInitial(_positions, amounts, tokens, minLPOut);
    }

    function reinvestCommission(
        uint256[] calldata offsetLimits,
        uint256 minDexeCommissionOut
    ) external virtual override onlyTraderAdmin onlyBABTHolder {
        investorsInfo.reinvestCommission(
            _investors,
            offsetLimits,
            minDexeCommissionOut,
            _poolParameters
        );
    }

    function mint(address account, uint256 amount) external override onlyThis {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external override onlyThis {
        _burn(account, amount);
    }

    function updateTo(
        address user,
        uint256 lpAmount,
        uint256 baseAmount
    ) external override onlyThis {
        _updateTo(user, lpAmount, baseAmount);
    }

    function updateFrom(
        address user,
        uint256 lpAmount,
        uint256 baseAmount
    ) external override onlyThis returns (uint256 baseTransfer) {
        return _updateFrom(user, lpAmount, baseAmount);
    }

    function setLatestInvestBlock(address user) external override onlyThis {
        latestInvestBlocks[user] = block.number;
    }

    function proposalPoolAddress() external view virtual override returns (address);

    function isPrivateInvestor(address who) public view override returns (bool) {
        return _privateInvestors.contains(who);
    }

    function isTraderAdmin(address who) public view override returns (bool) {
        return _traderAdmins.contains(who);
    }

    function isTrader(address who) public view override returns (bool) {
        return _poolParameters.trader == who;
    }

    function isBABTHolder(address who) public view override returns (bool) {
        return !_poolParameters.onlyBABTHolders || _babt.balanceOf(who) > 0;
    }

    function totalEmission() public view virtual override returns (uint256);

    function canRemovePrivateInvestor(
        address investor
    ) public view virtual override returns (bool);

    function openPositions() public view returns (address[] memory) {
        return coreProperties.getFilteredPositions(_positions.values());
    }

    function getNextCommissionEpoch() public view override returns (uint256) {
        return _poolParameters.getNextCommissionEpoch();
    }

    function totalInvestors() external view override returns (uint256) {
        return _investors.length();
    }

    function getUsersInfo(
        address user,
        uint256 offset,
        uint256 limit
    ) external view override returns (UserInfo[] memory usersInfo) {
        return _poolParameters.getUsersInfo(_investors, user, offset, limit);
    }

    function getPoolInfo() external view override returns (PoolInfo memory poolInfo) {
        return _poolParameters.getPoolInfo(_positions);
    }

    function getLeverageInfo() external view override returns (LeverageInfo memory leverageInfo) {
        return _poolParameters.getLeverageInfo();
    }

    function getInvestTokens(
        uint256 amountInBaseToInvest
    ) external view override returns (Receptions memory receptions) {
        return _poolParameters.getInvestTokens(amountInBaseToInvest);
    }

    function getInvestInitialTokens(
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external view override returns (uint256 lpAmount) {
        return _poolParameters.getInvestInitialTokens(tokens, amounts);
    }

    function getReinvestCommissions(
        uint256[] calldata offsetLimits
    ) external view override returns (Commissions memory commissions) {
        return _poolParameters.getReinvestCommissions(_investors, offsetLimits);
    }

    function getDivestAmountsAndCommissions(
        address user,
        uint256 amountLP
    )
        external
        view
        override
        returns (Receptions memory receptions, Commissions memory commissions)
    {
        return _poolParameters.getDivestAmountsAndCommissions(user, amountLP);
    }

    function getExchangeAmount(
        address from,
        address to,
        uint256 amount,
        address[] calldata optionalPath,
        ExchangeType exType
    ) external view override returns (uint256, address[] memory) {
        return
            _poolParameters.getExchangeAmount(_positions, from, to, amount, optionalPath, exType);
    }

    function getTraderBABTId() external view override returns (uint256) {
        return _poolParameters.traderBABTId;
    }

    function _updateFromData(
        address user,
        uint256 lpAmount
    ) internal returns (uint256 baseTransfer) {
        if (!isTrader(user)) {
            InvestorInfo storage info = investorsInfo[user];

            baseTransfer = info.investedBase.ratio(lpAmount, balanceOf(user));
            info.investedBase -= baseTransfer;
        }
    }

    function _updateToData(address user, uint256 baseAmount) internal {
        if (!isTrader(user)) {
            investorsInfo[user].investedBase += baseAmount;
        }
    }

    function _checkLeave(address user, uint256 lpAmount) internal {
        if (lpAmount == balanceOf(user)) {
            if (!isTrader(user)) {
                _investors.remove(user);
                investorsInfo[user].commissionUnlockEpoch = 0;
            }

            emit Left(user);
        }
    }

    function _checkJoin(address user) internal {
        require(
            !_poolParameters.privatePool || isTraderAdmin(user) || isPrivateInvestor(user),
            "TP: private pool"
        );

        if (balanceOf(user) == 0) {
            if (!isTrader(user)) {
                _investors.add(user);
                investorsInfo[user].commissionUnlockEpoch = getNextCommissionEpoch();

                require(
                    _investors.length() <= coreProperties.getMaximumPoolInvestors(),
                    "TP: max investors"
                );
            }

            emit Joined(user);
        }
    }

    function _updateFrom(
        address user,
        uint256 lpAmount,
        uint256 baseAmount
    ) internal returns (uint256 baseTransfer) {
        baseTransfer = _updateFromData(user, lpAmount);

        emit Divested(user, lpAmount, baseAmount == 0 ? baseTransfer : baseAmount);

        _checkLeave(user, lpAmount);
    }

    function _updateTo(address user, uint256 lpAmount, uint256 baseAmount) internal {
        _checkJoin(user);
        _updateToData(user, baseAmount);

        emit Invested(user, baseAmount, lpAmount);
    }

    /// @notice if trader transfers tokens to an investor, we will count them as "earned" and add to the commission calculation
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        require(amount > 0, "TP: 0 transfer");

        if (from != address(0) && to != address(0) && from != to) {
            uint256 baseTransfer = _updateFrom(from, amount, 0); // baseTransfer is intended to be zero if sender is a trader
            _updateTo(to, amount, baseTransfer);
        }
    }

    function _onlyTraderAdmin() internal view {
        require(isTraderAdmin(msg.sender), "TP: not an admin");
    }

    function _onlyTrader() internal view {
        require(isTrader(msg.sender), "TP: not a trader");
    }

    function _onlyThis() internal view {
        require(address(this) == msg.sender, "TP: not this contract");
    }

    function _onlyBABTHolder() internal view {
        require(isBABTHolder(msg.sender), "TP: not BABT holder");
    }

    uint256[28] private _gap;
}
