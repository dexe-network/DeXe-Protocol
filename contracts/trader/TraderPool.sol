// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "@dlsl/dev-modules/contracts-registry/AbstractDependant.sol";
import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IPriceFeed.sol";
import "../interfaces/insurance/IInsurance.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../libs/price-feed/PriceFeedLocal.sol";
import "../libs/trader-pool/TraderPoolPrice.sol";
import "../libs/trader-pool/TraderPoolLeverage.sol";
import "../libs/trader-pool/TraderPoolCommission.sol";
import "../libs/trader-pool/TraderPoolExchange.sol";
import "../libs/trader-pool/TraderPoolView.sol";
import "../libs/utils/TokenBalance.sol";
import "../libs/math/MathHelper.sol";

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
    using TraderPoolExchange for PoolParameters;
    using TraderPoolView for PoolParameters;
    using MathHelper for uint256;
    using PriceFeedLocal for IPriceFeed;
    using TokenBalance for address;

    IERC20 internal _dexeToken;
    IPriceFeed public override priceFeed;
    ICoreProperties public override coreProperties;

    EnumerableSet.AddressSet internal _traderAdmins;

    PoolParameters internal _poolParameters;

    EnumerableSet.AddressSet internal _privateInvestors;
    EnumerableSet.AddressSet internal _investors;
    EnumerableSet.AddressSet internal _positions;

    mapping(address => mapping(uint256 => uint256)) internal _investsInBlocks; // user => block => LP amount

    mapping(address => InvestorInfo) public investorsInfo;

    event Joined(address user);
    event Left(address user);
    event Invested(address user, uint256 investedBase, uint256 receivedLP);
    event Divested(address user, uint256 divestedLP, uint256 receivedBase);
    event ActivePortfolioExchanged(
        address fromToken,
        address toToken,
        uint256 fromVolume,
        uint256 toVolume
    );
    event CommissionClaimed(address sender, uint256 traderLpClaimed, uint256 traderBaseClaimed);
    event DescriptionURLChanged(address sender, string descriptionURL);
    event ModifiedAdmins(address sender, address[] admins, bool add);
    event ModifiedPrivateInvestors(address sender, address[] privateInvestors, bool add);

    modifier onlyTraderAdmin() {
        _onlyTraderAdmin();
        _;
    }

    modifier onlyTrader() {
        _onlyTrader();
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

        _dexeToken = IERC20(registry.getDEXEContract());
        priceFeed = IPriceFeed(registry.getPriceFeedContract());
        coreProperties = ICoreProperties(registry.getCorePropertiesContract());
    }

    function modifyAdmins(address[] calldata admins, bool add) external override onlyTraderAdmin {
        for (uint256 i = 0; i < admins.length; i++) {
            if (add) {
                _traderAdmins.add(admins[i]);
            } else {
                _traderAdmins.remove(admins[i]);
            }
        }

        _traderAdmins.add(_poolParameters.trader);

        emit ModifiedAdmins(msg.sender, admins, add);
    }

    function modifyPrivateInvestors(
        address[] calldata privateInvestors,
        bool add
    ) external override onlyTraderAdmin {
        for (uint256 i = 0; i < privateInvestors.length; i++) {
            if (add) {
                _privateInvestors.add(privateInvestors[i]);
            } else {
                require(
                    canRemovePrivateInvestor(privateInvestors[i]),
                    "TP: can't remove investor"
                );

                _privateInvestors.remove(privateInvestors[i]);
            }
        }

        emit ModifiedPrivateInvestors(msg.sender, privateInvestors, add);
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

        emit DescriptionURLChanged(msg.sender, descriptionURL);
    }

    function invest(
        uint256 amountInBaseToInvest,
        uint256[] calldata minPositionsOut
    ) public virtual override {
        require(amountInBaseToInvest > 0, "TP: zero investment");
        require(amountInBaseToInvest >= _poolParameters.minimalInvestment, "TP: underinvestment");

        _poolParameters.checkLeverage(amountInBaseToInvest);

        uint256 toMintLP = _investPositions(msg.sender, amountInBaseToInvest, minPositionsOut);

        _updateTo(msg.sender, toMintLP, amountInBaseToInvest);
        _mint(msg.sender, toMintLP);
    }

    function reinvestCommission(
        uint256[] calldata offsetLimits,
        uint256 minDexeCommissionOut
    ) external virtual override onlyTraderAdmin {
        require(openPositions().length == 0, "TP: positions are open");

        address[] memory investorsRaw = _investors.values();
        uint256 totalSupply = totalSupply();
        uint256 nextCommissionEpoch = getNextCommissionEpoch();
        uint256 allBaseCommission;
        uint256 allLPCommission;

        for (uint256 i = 0; i < offsetLimits.length; i += 2) {
            uint256 to = (offsetLimits[i] + offsetLimits[i + 1]).min(investorsRaw.length).max(
                offsetLimits[i]
            );

            for (uint256 j = offsetLimits[i]; j < to; j++) {
                address investor = investorsRaw[j];
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

                        allBaseCommission += baseCommission;
                        allLPCommission += lpCommission;
                    }
                }
            }
        }

        _distributeCommission(allBaseCommission, allLPCommission, minDexeCommissionOut);
    }

    function divest(
        uint256 amountLP,
        uint256[] calldata minPositionsOut,
        uint256 minDexeCommissionOut
    ) public virtual override {
        bool senderTrader = isTrader(msg.sender);
        require(!senderTrader || openPositions().length == 0, "TP: can't divest");

        if (senderTrader) {
            _divestTrader(amountLP);
        } else {
            _divestInvestor(amountLP, minPositionsOut, minDexeCommissionOut);
        }
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
        return _poolParameters.getReinvestCommissions(_investors.values(), offsetLimits);
    }

    function getNextCommissionEpoch() public view override returns (uint256) {
        return _poolParameters.nextCommissionEpoch();
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

    function _transferBase(
        address baseHolder,
        uint256 totalBaseInPool,
        uint256 amountInBaseToInvest
    ) internal returns (uint256) {
        IERC20(_poolParameters.baseToken).safeTransferFrom(
            baseHolder,
            address(this),
            amountInBaseToInvest.from18(_poolParameters.baseTokenDecimals)
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

        return toMintLP;
    }

    function _investPositions(
        address baseHolder,
        uint256 amountInBaseToInvest,
        uint256[] calldata minPositionsOut
    ) internal returns (uint256 toMintLP) {
        address baseToken = _poolParameters.baseToken;
        (
            uint256 totalBase,
            ,
            address[] memory positionTokens,
            uint256[] memory positionPricesInBase
        ) = _poolParameters.getNormalizedPoolPriceAndPositions();

        toMintLP = _transferBase(baseHolder, totalBase, amountInBaseToInvest);

        for (uint256 i = 0; i < positionTokens.length; i++) {
            uint256 amount = positionPricesInBase[i].ratio(amountInBaseToInvest, totalBase);
            uint256 amountGot = priceFeed.normExchangeFromExact(
                baseToken,
                positionTokens[i],
                amount,
                new address[](0),
                minPositionsOut[i]
            );

            emit ActivePortfolioExchanged(baseToken, positionTokens[i], amount, amountGot);
        }
    }

    function _distributeCommission(
        uint256 baseToDistribute,
        uint256 lpToDistribute,
        uint256 minDexeCommissionOut
    ) internal {
        require(baseToDistribute > 0, "TP: no commission available");

        (
            uint256 dexePercentage,
            ,
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

        emit CommissionClaimed(
            msg.sender,
            lpToDistribute - dexeLPCommission,
            baseToDistribute - dexeBaseCommission
        );
    }

    function _divestPositions(
        uint256 amountLP,
        uint256[] calldata minPositionsOut
    ) internal returns (uint256 investorBaseAmount) {
        _checkUserBalance(amountLP);

        address[] memory _openPositions = openPositions();
        address baseToken = _poolParameters.baseToken;
        uint256 totalSupply = totalSupply();

        investorBaseAmount = baseToken.normThisBalance().ratio(amountLP, totalSupply);

        for (uint256 i = 0; i < _openPositions.length; i++) {
            uint256 amount = _openPositions[i].normThisBalance().ratio(amountLP, totalSupply);
            uint256 amountGot = priceFeed.normExchangeFromExact(
                _openPositions[i],
                baseToken,
                amount,
                new address[](0),
                minPositionsOut[i]
            );

            investorBaseAmount += amountGot;

            emit ActivePortfolioExchanged(_openPositions[i], baseToken, amount, amountGot);
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
        uint256 receivedBase = investorBaseAmount - baseCommission;

        _updateFrom(msg.sender, amountLP, receivedBase);
        _burn(msg.sender, amountLP);

        IERC20(_poolParameters.baseToken).safeTransfer(
            msg.sender,
            receivedBase.from18(_poolParameters.baseTokenDecimals)
        );

        if (baseCommission > 0) {
            _distributeCommission(baseCommission, lpCommission, minDexeCommissionOut);
        }
    }

    function _divestTrader(uint256 amountLP) internal {
        _checkUserBalance(amountLP);

        IERC20 baseToken = IERC20(_poolParameters.baseToken);
        uint256 receivedBase = address(baseToken).normThisBalance().ratio(amountLP, totalSupply());

        _updateFrom(msg.sender, amountLP, receivedBase);
        _burn(msg.sender, amountLP);

        baseToken.safeTransfer(msg.sender, receivedBase.from18(_poolParameters.baseTokenDecimals));
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

    function _checkUserBalance(uint256 amountLP) internal view {
        require(
            amountLP <= balanceOf(msg.sender) - _investsInBlocks[msg.sender][block.number],
            "TP: wrong amount"
        );
    }
}
