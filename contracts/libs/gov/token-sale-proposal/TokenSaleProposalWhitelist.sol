// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../../gov/proposals/TokenSaleProposal.sol";

import "../../../libs/utils/TokenBalance.sol";
import "./TokenSaleProposalDecode.sol";

library TokenSaleProposalWhitelist {
    using TokenSaleProposalDecode for ITokenSaleProposal.Tier;
    using TokenBalance for address;
    using DecimalsConverter for uint256;
    using SafeERC20 for IERC20;

    function lockParticipationTokens(ITokenSaleProposal.Tier storage tier) external {
        ITokenSaleProposal.PurchaseInfo storage purchaseInfo = tier.users[msg.sender].purchaseInfo;

        (address token, uint256 amount) = tier.decodeTokenLock();

        require(purchaseInfo.lockedAmount == 0, "TSP: already locked");

        purchaseInfo.lockedAmount = amount;

        if (token != ETHEREUM_ADDRESS) {
            IERC20(token).safeTransferFrom(
                msg.sender,
                address(this),
                amount.from18(ERC20(token).decimals())
            );
        } else {
            require(msg.value == amount, "TSP: wrong lock amount");
        }
    }

    function lockParticipationNft(ITokenSaleProposal.Tier storage tier, uint256 tokenId) external {
        ITokenSaleProposal.PurchaseInfo storage purchaseInfo = tier.users[msg.sender].purchaseInfo;

        address token = tier.decodeNftLock();

        require(purchaseInfo.lockedId == 0, "TSP: already locked");

        purchaseInfo.lockedId = tokenId;

        IERC721(token).safeTransferFrom(msg.sender, address(this), tokenId);
    }

    function unlockParticipationTokens(ITokenSaleProposal.Tier storage tier) external {
        ITokenSaleProposal.PurchaseInfo storage purchaseInfo = tier.users[msg.sender].purchaseInfo;

        (address token, uint256 amount) = tier.decodeTokenLock();

        require(block.timestamp >= tier.tierInitParams.saleEndTime, "TSP: sale is not over");
        require(purchaseInfo.lockedAmount == amount, "TSP: not locked");

        purchaseInfo.lockedAmount = 0;

        token.sendFunds(msg.sender, amount);
    }

    function unlockParticipationNft(ITokenSaleProposal.Tier storage tier) external {
        ITokenSaleProposal.PurchaseInfo storage purchaseInfo = tier.users[msg.sender].purchaseInfo;

        address token = tier.decodeNftLock();
        uint256 tokenId = purchaseInfo.lockedId;

        require(block.timestamp >= tier.tierInitParams.saleEndTime, "TSP: sale is not over");
        require(tokenId != 0, "TSP: not locked");

        purchaseInfo.lockedId = 0;

        IERC721(token).safeTransferFrom(address(this), msg.sender, tokenId);
    }

    function addToWhitelist(
        ITokenSaleProposal.Tier storage tier,
        ITokenSaleProposal.WhitelistingRequest calldata request
    ) external {
        require(
            tier.tierInitParams.participationDetails.participationType ==
                ITokenSaleProposal.ParticipationType.Whitelist,
            "TSP: wrong participation type"
        );

        tier.tierInfo.uri = request.uri;

        for (uint256 i = 0; i < request.users.length; i++) {
            TokenSaleProposal(address(this)).mint(request.users[i], request.tierId);
        }
    }
}
