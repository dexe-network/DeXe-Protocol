// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../../interfaces/gov/proposals/ITokenSaleProposal.sol";

import "../../../gov/proposals/TokenSaleProposal.sol";

import "../../../core/Globals.sol";

library TokenSaleProposalCreate {
    using DecimalsConverter for uint256;
    using Math for uint256;

    function createTier(
        mapping(uint256 => ITokenSaleProposal.Tier) storage tiers,
        uint256 newTierId,
        ITokenSaleProposal.TierInitParams memory tierInitParams
    ) external {
        require(tierInitParams.saleTokenAddress != address(0), "TSP: sale token cannot be zero");
        require(
            tierInitParams.saleTokenAddress != ETHEREUM_ADDRESS,
            "TSP: cannot sale native currency"
        );
        require(tierInitParams.totalTokenProvided != 0, "TSP: sale token is not provided");
        require(
            tierInitParams.saleStartTime <= tierInitParams.saleEndTime,
            "TSP: saleEndTime is less than saleStartTime"
        );
        require(
            tierInitParams.minAllocationPerUser <= tierInitParams.maxAllocationPerUser,
            "TSP: wrong allocation"
        );
        require(
            _validateVestingSettings(tierInitParams.vestingSettings),
            "TSP: vesting settings validation failed"
        );
        require(
            _validateParticipationDetails(tierInitParams.participationDetails),
            "TSP: participation details validation failed"
        );
        require(
            tierInitParams.purchaseTokenAddresses.length != 0,
            "TSP: purchase tokens are not provided"
        );
        require(
            tierInitParams.purchaseTokenAddresses.length == tierInitParams.exchangeRates.length,
            "TSP: tokens and rates lengths mismatch"
        );

        uint256 saleTokenDecimals = ERC20(tierInitParams.saleTokenAddress).decimals();

        tierInitParams.minAllocationPerUser = tierInitParams.minAllocationPerUser.to18(
            saleTokenDecimals
        );
        tierInitParams.maxAllocationPerUser = tierInitParams.maxAllocationPerUser.to18(
            saleTokenDecimals
        );
        tierInitParams.totalTokenProvided = tierInitParams.totalTokenProvided.to18(
            saleTokenDecimals
        );

        if (
            tierInitParams.participationDetails.participationType ==
            ITokenSaleProposal.ParticipationType.TokenLock
        ) {
            (address token, uint256 amount) = abi.decode(
                tierInitParams.participationDetails.data,
                (address, uint256)
            );
            tierInitParams.participationDetails.data = abi.encode(
                token,
                token == ETHEREUM_ADDRESS ? amount : amount.to18(ERC20(token).decimals())
            );
        }

        ITokenSaleProposal.Tier storage tier = tiers[newTierId];

        for (uint256 i = 0; i < tierInitParams.purchaseTokenAddresses.length; i++) {
            require(tierInitParams.exchangeRates[i] != 0, "TSP: rate cannot be zero");
            require(
                tierInitParams.purchaseTokenAddresses[i] != address(0),
                "TSP: purchase token cannot be zero"
            );
            require(
                tier.rates[tierInitParams.purchaseTokenAddresses[i]] == 0,
                "TSP: purchase tokens are duplicated"
            );

            tier.rates[tierInitParams.purchaseTokenAddresses[i]] = tierInitParams.exchangeRates[i];
        }

        uint64 vestingStartTime = tierInitParams.vestingSettings.vestingDuration == 0
            ? 0
            : tierInitParams.saleEndTime + tierInitParams.vestingSettings.cliffPeriod;
        tier.tierInitParams = tierInitParams;
        tier.tierInfo.vestingTierInfo = ITokenSaleProposal.VestingTierInfo({
            vestingStartTime: vestingStartTime,
            vestingEndTime: vestingStartTime + tierInitParams.vestingSettings.vestingDuration
        });
    }

    function getTierViews(
        mapping(uint256 => ITokenSaleProposal.Tier) storage tiers,
        uint256 offset,
        uint256 limit
    ) external view returns (ITokenSaleProposal.TierView[] memory tierViews) {
        uint256 to = (offset + limit).min(TokenSaleProposal(address(this)).latestTierId()).max(
            offset
        );

        tierViews = new ITokenSaleProposal.TierView[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            ITokenSaleProposal.Tier storage tier = tiers[i + 1];

            tierViews[i - offset] = ITokenSaleProposal.TierView({
                tierInitParams: tier.tierInitParams,
                tierInfo: tier.tierInfo
            });
        }
    }

    function _validateVestingSettings(
        ITokenSaleProposal.VestingSettings memory vestingSettings
    ) private pure returns (bool) {
        if (
            vestingSettings.vestingPercentage == 0 &&
            vestingSettings.vestingDuration == 0 &&
            vestingSettings.unlockStep == 0 &&
            vestingSettings.cliffPeriod == 0
        ) {
            return true;
        }

        return
            vestingSettings.vestingDuration != 0 &&
            vestingSettings.vestingPercentage != 0 &&
            vestingSettings.unlockStep != 0 &&
            vestingSettings.vestingPercentage <= PERCENTAGE_100 &&
            vestingSettings.vestingDuration >= vestingSettings.unlockStep;
    }

    function _validateParticipationDetails(
        ITokenSaleProposal.ParticipationDetails memory participationDetails
    ) private pure returns (bool) {
        if (
            participationDetails.participationType == ITokenSaleProposal.ParticipationType.DAOVotes
        ) {
            return participationDetails.data.length == 32;
        } else if (
            participationDetails.participationType ==
            ITokenSaleProposal.ParticipationType.Whitelist
        ) {
            return participationDetails.data.length == 0;
        } else if (
            participationDetails.participationType == ITokenSaleProposal.ParticipationType.BABT
        ) {
            return participationDetails.data.length == 0;
        } else if (
            participationDetails.participationType ==
            ITokenSaleProposal.ParticipationType.TokenLock
        ) {
            return participationDetails.data.length == 64;
        } else {
            return participationDetails.data.length == 32;
        }
    }
}
