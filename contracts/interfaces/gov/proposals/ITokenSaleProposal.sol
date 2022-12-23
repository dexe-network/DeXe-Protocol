// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITokenSaleProposal {
    struct VestingSettings {
        uint256 vestingDuration;
        uint256 cliffPeriod;
        uint256 unlockStep;
    }

    struct Tier {
        string name;
        string description;
        uint256 totalTokenProvided;
        uint256 saleStartTime;
        uint256 saleEndTime;
        address saleTokenAddress;
        address[] purchaseTokenAddresses;
        uint256[] exchangeRates;
        uint256 minAllocationPerUser;
        uint256 maxAllocationPerUser;
        uint256 vestingPercentage;
        VestingSettings vestingSettings;
    }

    struct TierBackend {
        bool exists;
        bool isOff;
        mapping(address => uint256) rates;
        mapping(address => Purchase) customers;
    }

    struct Purchase {
        uint256 purchaseTime;
        uint256 amount;
        uint256 latestVestingWithdraw;
    }

    struct WhitelistingRequest {
        uint256 tierId;
        address[] users;
    }

    struct RecoveringRequest {
        uint256 tierId;
        address[] tokens;
    }

    function latestTierId() external view returns (uint256);

    function createTiers(Tier[] calldata tiers) external;

    function addToWhitelist(WhitelistingRequest[] calldata requests) external;

    function offTiers(uint256[] calldata tierIds) external;

    function vestingWithdraw(uint256[] calldata tierIds) external;

    function buy(uint256 tierId, address tokenToBuyWith, uint256 amount) external payable;

    function recover(RecoveringRequest[] calldata requests) external;

    function getSaleTokenAmount(
        uint256 tierId,
        address tokenToBuyWith,
        uint256 amount
    ) external view returns (uint256);

    function getVestingWithdrawAmounts(
        uint256[] memory tierIds
    ) external view returns (uint256[] memory);

    function getTiers(uint256 offset, uint256 limit) external view returns (Tier[] memory);
}
