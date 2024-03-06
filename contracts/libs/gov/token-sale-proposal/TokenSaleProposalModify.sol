// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
// import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

// import "@solarity/solidity-lib/libs/utils/TypeCaster.sol";
// import "@solarity/solidity-lib/libs/utils/DecimalsConverter.sol";

import "../../../interfaces/gov/proposals/ITokenSaleProposal.sol";

// import "../../../interfaces/gov/IGovPool.sol";
// import "../../../interfaces/gov/user-keeper/IGovUserKeeper.sol";

// import "../../../core/CoreProperties.sol";
// import "../../../gov/proposals/TokenSaleProposal.sol";

// import "../../../libs/math/MathHelper.sol";
// import "../../../libs/utils/TypeHelper.sol";

library TokenSaleProposalModify {
    // using MathHelper for uint256;
    // using DecimalsConverter for *;
    // using TypeCaster for *;
    // using TypeHelper for *;
    // using SafeERC20 for IERC20;
    // using EnumerableSet for *;
    using EnumerableMap for EnumerableMap.AddressToUintMap;

    // using MerkleProof for *;

    function changeParticipationDetails(
        ITokenSaleProposal.Tier storage tier,
        ITokenSaleProposal.ParticipationInfoView calldata newSettings
    ) external {
        require(!tier.tierInfo.isOff, "TSP: tier is off");
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
