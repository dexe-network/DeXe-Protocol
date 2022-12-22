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

    function createTiers(Tier[] memory tiers) external;

    function addToWhitelist(uint256 tierId, address[] memory users) external;

    function offTier(uint256 tierId) external;

    function vestingWithdraw(uint256 tierId) external;

    function buy(uint256 tierId, address tokenToBuyWith, uint256 amount) external payable;
}
