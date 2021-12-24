// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../core/IPriceFeed.sol";
import "../core/ICoreProperties.sol";

interface ITraderPool {
    struct PoolParameters {
        string descriptionURL;
        address trader;
        bool privatePool;
        uint256 totalLPEmission; // zero means unlimited
        address baseToken;
        uint256 baseTokenDecimals;
        uint256 minimalInvestment; // zero means any value
        ICoreProperties.CommissionPeriod commissionPeriod;
        uint256 commissionPercentage;
    }

    struct InvestorInfo {
        uint256 investedBase;
        uint256 commissionUnlockEpoch;
    }

    struct Commissions {
        uint256 traderBaseCommission;
        uint256 dexeBaseCommission;
        uint256 dexeDexeCommission;
    }

    struct Receptions {
        uint256 baseAmount;
        address[] positions;
        uint256[] receivedAmounts;
    }

    function priceFeed() external view returns (IPriceFeed);

    function coreProperties() external view returns (ICoreProperties);

    function isTraderAdmin(address who) external view returns (bool);

    function isTrader(address who) external view returns (bool);

    function addAdmins(address[] calldata admins) external;

    function removeAdmins(address[] calldata admins) external;

    function changePoolParameters(
        string calldata descriptionURL,
        bool privatePool,
        uint256 totalLPEmission,
        uint256 minimalInvestment
    ) external;

    function changePrivateInvestors(bool remove, address[] calldata privateInvestors) external;

    function totalOpenPositions() external view returns (uint256);

    function totalInvestors() external view returns (uint256);

    function proposalPoolAddress() external view returns (address);

    function totalEmission() external view returns (uint256);

    function getInvestTokens(uint256 amountInBaseToInvest)
        external
        view
        returns (Receptions memory receptions);

    function invest(uint256 amountInBaseToInvest, uint256[] calldata minPositionsOut) external;

    function getReinvestCommissions(uint256 offset, uint256 limit)
        external
        view
        returns (Commissions memory commissions);

    function reinvestCommission(
        uint256 offset,
        uint256 limit,
        uint256 minDexeCommissionOut
    ) external;

    function getDivestAmountsAndCommissions(address user, uint256 amountLP)
        external
        view
        returns (Receptions memory receptions, Commissions memory commissions);

    function divest(
        uint256 amountLP,
        uint256[] calldata minPositionsOut,
        uint256 minDexeCommissionOut
    ) external;

    function divestAll(uint256[] calldata minPositionsOut, uint256 minDexeCommissionOut) external;

    function getExchangeFromExactAmount(
        address from,
        address to,
        uint256 amountIn,
        address[] calldata optionalPath
    ) external view returns (uint256 minAmountOut);

    function exchangeFromExact(
        address from,
        address to,
        uint256 amountIn,
        uint256 minAmountOut,
        address[] calldata optionalPath
    ) external;

    function getExchangeToExactAmount(
        address from,
        address to,
        uint256 amountOut,
        address[] calldata optionalPath
    ) external view returns (uint256 maxAmountIn);

    function exchangeToExact(
        address from,
        address to,
        uint256 amountOut,
        uint256 maxAmountIn,
        address[] calldata optionalPath
    ) external;
}
