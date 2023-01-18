// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
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

abstract contract TraderPool is ITraderPool, ERC20Upgradeable, AbstractDependant {
    using EnumerableSet for EnumerableSet.AddressSet;
    using MathHelper for uint256;
    using TraderPoolCommission for *;
    using TraderPoolExchange for *;
    using TraderPoolModify for *;
    using TraderPoolInvest for *;
    using TraderPoolDivest for *;
    using TraderPoolView for *;

    IERC20 public dexeToken;
    ISBT721 internal _babt;
    IPriceFeed public priceFeed;
    ICoreProperties public coreProperties;

    EnumerableSet.AddressSet internal _traderAdmins;

    PoolParameters internal _poolParameters;

    EnumerableSet.AddressSet internal _privateInvestors;
    EnumerableSet.AddressSet internal _investors;
    EnumerableSet.AddressSet internal _positions;

    mapping(address => mapping(uint256 => uint256)) public investsInBlocks; // user => block => LP amount
    mapping(address => InvestorInfo) public investorsInfo;
    mapping(address => uint256) public adminBABTIDs;

    event Joined(address user);
    event Left(address user);
    event Invested(address user, uint256 investedBase, uint256 receivedLP);
    event Divested(address user, uint256 divestedLP, uint256 receivedBase);

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

    function isPrivateInvestor(address who) public view override returns (bool) {
        return _privateInvestors.contains(who);
    }

    function isTraderAdmin(address who) public view override returns (bool) {
        return _traderAdmins.contains(who);
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
        _traderAdmins.add(poolParameters.trader);
    }

    function setDependencies(address contractsRegistry) public virtual override dependant {
        IContractsRegistry registry = IContractsRegistry(contractsRegistry);

        dexeToken = IERC20(registry.getDEXEContract());
        _babt = ISBT721(registry.getBABTContract());
        priceFeed = IPriceFeed(registry.getPriceFeedContract());
        coreProperties = ICoreProperties(registry.getCorePropertiesContract());

        address trader = _poolParameters.trader;

        if (_babt.balanceOf(trader) > 0) {
            adminBABTIDs[trader] = _babt.tokenIdOf(trader);
        }
    }

    function modifyAdmins(address[] calldata admins, bool add) external override onlyTraderAdmin {
        _traderAdmins.modifyAdmins(_poolParameters, admins, adminBABTIDs, _babt, add);
    }

    function modifyPrivateInvestors(
        address[] calldata privateInvestors,
        bool add
    ) external override onlyTraderAdmin {
        _privateInvestors.modifyPrivateInvestors(privateInvestors, add);
    }

    function changePoolParameters(
        string calldata descriptionURL,
        bool privatePool,
        uint256 totalLPEmission,
        uint256 minimalInvestment
    ) external override onlyTraderAdmin {
        _poolParameters.changePoolParameters(
            _investors,
            descriptionURL,
            privatePool,
            totalLPEmission,
            minimalInvestment
        );
    }

    function invest(
        uint256 amountInBaseToInvest,
        uint256[] calldata minPositionsOut
    ) public virtual override onlyBABTHolder {
        _poolParameters.invest(investsInBlocks, amountInBaseToInvest, minPositionsOut);
    }

    function reinvestCommission(
        uint256[] calldata offsetLimits,
        uint256 minDexeCommissionOut
    ) external virtual override onlyTraderAdmin {
        investorsInfo.reinvestCommission(
            _investors,
            offsetLimits,
            minDexeCommissionOut,
            _poolParameters
        );
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
    ) public virtual override onlyTraderAdmin {
        _poolParameters.exchange(_positions, from, to, amount, amountBound, optionalPath, exType);
    }

    function mint(address account, uint256 amount) external onlyThis {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external onlyThis {
        _burn(account, amount);
    }

    function updateTo(address user, uint256 lpAmount, uint256 baseAmount) external onlyThis {
        _updateTo(user, lpAmount, baseAmount);
    }

    function updateFrom(
        address user,
        uint256 lpAmount,
        uint256 baseAmount
    ) external onlyThis returns (uint256 baseTransfer) {
        return _updateFrom(user, lpAmount, baseAmount);
    }

    function proposalPoolAddress() external view virtual override returns (address);

    function totalEmission() public view virtual override returns (uint256);

    function canRemovePrivateInvestor(
        address investor
    ) public view virtual override returns (bool);

    function totalInvestors() external view override returns (uint256) {
        return _investors.length();
    }

    function openPositions() public view returns (address[] memory) {
        return coreProperties.getFilteredPositions(_positions.values());
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

    function getReinvestCommissions(
        uint256[] calldata offsetLimits
    ) external view override returns (Commissions memory commissions) {
        return _poolParameters.getReinvestCommissions(_investors, offsetLimits);
    }

    function getNextCommissionEpoch() public view override returns (uint256) {
        return _poolParameters.getNextCommissionEpoch();
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
        require(
            _babt.balanceOf(msg.sender) > 0 || !_poolParameters.onlyBABTHolder,
            "Gov: not BABT holder"
        );
    }

    function _checkUserBalance(uint256 amountLP) internal view {
        require(
            amountLP <= balanceOf(msg.sender) - investsInBlocks[msg.sender][block.number],
            "TP: wrong amount"
        );
    }
}
