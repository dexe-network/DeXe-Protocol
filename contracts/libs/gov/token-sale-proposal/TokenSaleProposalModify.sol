// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";

import "../../../interfaces/gov/proposals/ITokenSaleProposal.sol";

library TokenSaleProposalModify {
    using EnumerableMap for EnumerableMap.AddressToUintMap;

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
}
