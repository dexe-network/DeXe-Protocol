// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../interfaces/gov/proposals/ITokenSaleProposal.sol";
import "../../core/Globals.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

contract TokenSaleProposal is ITokenSaleProposal, ERC1155Upgradeable {
    address public govAddress;

    uint256 internal _latestTierId;

    mapping(uint256 => Tier) internal _tiers;
    mapping(uint256 => TierBackend) internal _tiersBackend;

    modifier onlyGov() {
        require(msg.sender == govAddress, "TSP: not a Gov contract");
        _;
    }

    modifier ifTierExists(uint256 tierId) {
        require(_tiersBackend[tierId].exists, "TSP: tier does not exist");
        _;
    }

    function __TokenSaleProposal_init(address _govAddress) external initializer {
        govAddress = _govAddress;
    }

    function setGovAddress(address _govAddress) external {
        require(govAddress == address(0), "TSP: govAddress is set");
        require(_govAddress != address(0), "TSP: cannot set zero govAddress");

        govAddress = _govAddress;
    }

    function createTiers(Tier[] memory tiers) external override onlyGov {
        for (uint256 i = 0; i < tiers.length; i++) {
            _createTier(tiers[i]);
        }
    }

    function addToWhitelist(
        uint256 tierId,
        address[] memory users
    ) external override ifTierExists(tierId) {}

    function offTier(uint256 tierId) external override ifTierExists(tierId) {}

    function vestingWithdraw(uint256 tierId) external override ifTierExists(tierId) {}

    function buy(
        uint256 tierId,
        address tokenToBuyWith,
        uint256 amount
    ) external payable ifTierExists(tierId) {}

    function _createTier(Tier memory tier) private {
        require(tier.saleTokenAddress != address(0), "TSP: sale token cannot be zero");
        require(tier.saleTokenAddress != ETHEREUM_ADDRESS, "TSP: cannot sale native currency");

        require(
            tier.purchaseTokenAddresses.length == tier.exchangeRates.length,
            "TSP: tokens and rates lens mismatch"
        );

        require(
            tier.saleStartTime <= tier.saleEndTime,
            "TSP: saleEndTime is less than saleStartTime"
        );

        require(
            tier.minAllocationPerUser <= tier.maxAllocationPerUser &&
                tier.maxAllocationPerUser <= tier.totalTokenProvided,
            "TSP: wrong allocation"
        );

        for (uint256 i = 0; i < tier.purchaseTokenAddresses.length; i++) {
            require(
                tier.purchaseTokenAddresses[i] != address(0),
                "TSP: purchase token cannot be zero"
            );
        }

        for (uint256 i = 0; i < tier.exchangeRates.length; i++) {
            require(tier.exchangeRates[i] != 0, "TSP: rate cannot be zero");
        }

        require(tier.vestingPercentage <= PERCENTAGE_100, "TSP: vestingPercentage > 100%");

        require(tier.vestingSettings.unlockStep != 0, "TSP: unlockStep cannot be zero");

        ++_latestTierId;

        _tiers[_latestTierId] = tier;

        TierBackend storage tierBackend = _tiersBackend[_latestTierId];

        tierBackend.exists = true;

        for (uint256 i = 0; i < tier.purchaseTokenAddresses.length; i++) {
            require(
                tierBackend.rates[tier.purchaseTokenAddresses[i]] == 0,
                "TSP: purchase tokens are duplicated"
            );

            tierBackend.rates[tier.purchaseTokenAddresses[i]] = tier.exchangeRates[i];
        }
    }
}
