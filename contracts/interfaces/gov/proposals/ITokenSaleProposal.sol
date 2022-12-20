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
}
