// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";

import "../../../interfaces/gov/proposals/ITokenSaleProposal.sol";

library TokenSaleProposalModify {
    using EnumerableMap for EnumerableMap.AddressToUintMap;

    function changeParticipationDetails(
        ITokenSaleProposal.Tier storage tier,
        ITokenSaleProposal.ParticipationInfoView calldata newSettings
    ) external {
        require(block.timestamp <= tier.tierInitParams.saleEndTime, "TSP: token sale is over");

        address[] calldata tokenAddresses = newSettings.requiredTokenAddresses;
        uint256[] calldata tokenAmounts = newSettings.requiredTokenAmounts;
        address[] calldata nftAddresses = newSettings.requiredNftAddresses;
        uint256[] calldata nftAmounts = newSettings.requiredNftAmounts;
        require(
            tokenAddresses.length == tokenAmounts.length,
            "TSP: Tokens and amounts numbers does not match"
        );
        require(
            nftAddresses.length == nftAmounts.length,
            "TSP: Nfts and amounts numbers does not match"
        );

        ITokenSaleProposal.ParticipationInfo storage participationInfo = tier.participationInfo;
        ITokenSaleProposal.TierAdditionalInfo storage additionalInfo = tier.tierAdditionalInfo;

        participationInfo.isWhitelisted = newSettings.isWhitelisted;
        participationInfo.isBABTed = newSettings.isBABTed;
        participationInfo.requiredDaoVotes = newSettings.requiredDaoVotes;
        additionalInfo.merkleRoot = newSettings.merkleRoot;
        additionalInfo.merkleUri = newSettings.merkleUri;
        _updateEnumerableMap(participationInfo.requiredTokenLock, tokenAddresses, tokenAmounts);
        _updateEnumerableMap(participationInfo.requiredNftLock, nftAddresses, nftAmounts);
    }

    function getParticipationDetails(
        ITokenSaleProposal.Tier storage tier
    )
        external
        view
        returns (ITokenSaleProposal.ParticipationInfoView memory participationDetails)
    {
        ITokenSaleProposal.ParticipationInfo storage participationInfo = tier.participationInfo;
        ITokenSaleProposal.TierAdditionalInfo storage additionalInfo = tier.tierAdditionalInfo;

        participationDetails.isWhitelisted = participationInfo.isWhitelisted;
        participationDetails.isBABTed = participationInfo.isBABTed;
        participationDetails.requiredDaoVotes = participationInfo.requiredDaoVotes;
        participationDetails.merkleRoot = additionalInfo.merkleRoot;
        participationDetails.merkleUri = additionalInfo.merkleUri;

        uint256 length = participationInfo.requiredTokenLock.length();

        address[] memory addresses = new address[](length);
        uint256[] memory amounts = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            (addresses[i], amounts[i]) = participationInfo.requiredTokenLock.at(i);
        }

        participationDetails.requiredTokenAddresses = addresses;
        participationDetails.requiredTokenAmounts = amounts;

        length = participationInfo.requiredNftLock.length();
        addresses = new address[](length);
        amounts = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            (addresses[i], amounts[i]) = participationInfo.requiredNftLock.at(i);
        }

        participationDetails.requiredNftAddresses = addresses;
        participationDetails.requiredNftAmounts = amounts;
    }

    function _updateEnumerableMap(
        EnumerableMap.AddressToUintMap storage map,
        address[] calldata addresses,
        uint256[] calldata amounts
    ) internal {
        for (uint256 i = map.length(); i > 0; i--) {
            (address key, ) = map.at(i - 1);
            map.remove(key);
        }
        for (uint256 i = 0; i < addresses.length; i++) {
            require(map.set(addresses[i], amounts[i]), "TSP: Duplicated address");
        }
    }
}
