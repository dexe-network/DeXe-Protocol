// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/proposals/ITokenSaleProposal.sol";
import "../../interfaces/core/ISBT721.sol";

import "../../libs/token-sale-proposal/TokenSaleProposalDecode.sol";
import "../../libs/token-sale-proposal/TokenSaleProposalCreate.sol";
import "../../libs/token-sale-proposal/TokenSaleProposalBuy.sol";
import "../../libs/token-sale-proposal/TokenSaleProposalVesting.sol";
import "../../libs/token-sale-proposal/TokenSaleProposalLock.sol";
import "../../libs/token-sale-proposal/TokenSaleProposalClaim.sol";
import "../../libs/token-sale-proposal/TokenSaleProposalRecover.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/utils/TokenBalance.sol";

import "../../core/Globals.sol";

contract TokenSaleProposal is ITokenSaleProposal, ERC1155SupplyUpgradeable, Multicall {
    using MathHelper for uint256;
    using TokenBalance for *;
    using Math for uint256;
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;
    using TokenSaleProposalDecode for Tier;
    using TokenSaleProposalCreate for *;
    using TokenSaleProposalBuy for Tier;
    using TokenSaleProposalVesting for Tier;
    using TokenSaleProposalLock for Tier;
    using TokenSaleProposalClaim for Tier;
    using TokenSaleProposalRecover for Tier;

    address public govAddress;
    ISBT721 public babt;

    uint256 public override latestTierId;

    mapping(uint256 => Tier) internal _tiers;

    event TierCreated(uint256 tierId, address saleToken);
    event Bought(uint256 tierId, address buyer);
    event Whitelisted(uint256 tierId, address user);

    modifier onlyGov() {
        _onlyGov();
        _;
    }

    function __TokenSaleProposal_init(address _govAddress, ISBT721 _babt) external initializer {
        require(_govAddress != address(0), "TSP: zero gov address");

        govAddress = _govAddress;
        babt = _babt;
    }

    function createTiers(TierInitParams[] calldata tiers) external override onlyGov {
        uint256 tierIdFrom = latestTierId + 1;

        latestTierId += tiers.length;

        for (uint256 i = 0; i < tiers.length; i++) {
            _tiers.createTier(tiers[i], tierIdFrom + i);

            emit TierCreated(tierIdFrom + i, tiers[i].saleTokenAddress);
        }
    }

    function addToWhitelist(WhitelistingRequest[] calldata requests) external override onlyGov {
        for (uint256 i = 0; i < requests.length; i++) {
            WhitelistingRequest calldata request = requests[i];

            Tier storage tier = _getActiveTier(request.tierId);

            require(
                tier.tierInitParams.participationDetails.participationType ==
                    ParticipationType.Whitelist,
                "TSP: wrong participation type"
            );

            tier.tierInfo.uri = request.uri;

            for (uint256 j = 0; j < request.users.length; j++) {
                _mint(request.users[j], request.tierId, 1, "");

                emit Whitelisted(request.tierId, request.users[j]);
            }
        }
    }

    function offTiers(uint256[] calldata tierIds) external override onlyGov {
        for (uint256 i = 0; i < tierIds.length; i++) {
            _getActiveTier(tierIds[i]).tierInfo.isOff = true;
        }
    }

    function recover(uint256[] calldata tierIds) external onlyGov {
        for (uint256 i = 0; i < tierIds.length; i++) {
            _getTier(tierIds[i]).recover();
        }
    }

    function claim(uint256[] calldata tierIds) external override {
        for (uint256 i = 0; i < tierIds.length; i++) {
            _getTier(tierIds[i]).claim();
        }
    }

    function vestingWithdraw(uint256[] calldata tierIds) external override {
        for (uint256 i = 0; i < tierIds.length; i++) {
            _getTier(tierIds[i]).vestingWithdraw();
        }
    }

    function buy(uint256 tierId, address tokenToBuyWith, uint256 amount) external payable {
        _getActiveTier(tierId).buy(tierId, tokenToBuyWith, amount);

        emit Bought(tierId, msg.sender);
    }

    function lockParticipationTokens(uint256 tierId) external payable override {
        _getActiveTier(tierId).lockParticipationTokens();
    }

    function lockParticipationNft(uint256 tierId, uint256 tokenId) external override {
        _getActiveTier(tierId).lockParticipationNft(tokenId);
    }

    function unlockParticipationTokens(uint256 tierId) external override {
        _getTier(tierId).unlockParticipationTokens();
    }

    function unlockParticipationNft(uint256 tierId) external override {
        _getTier(tierId).unlockParticipationNft();
    }

    function getSaleTokenAmount(
        address user,
        uint256 tierId,
        address tokenToBuyWith,
        uint256 amount
    ) external view returns (uint256) {
        return _getActiveTier(tierId).getSaleTokenAmount(user, tierId, tokenToBuyWith, amount);
    }

    function getClaimAmounts(
        address user,
        uint256[] calldata tierIds
    ) external view returns (uint256[] memory claimAmounts) {
        claimAmounts = new uint256[](tierIds.length);

        for (uint256 i = 0; i < tierIds.length; i++) {
            claimAmounts[i] = _getTier(tierIds[i]).getClaimAmount(user);
        }
    }

    function getVestingWithdrawAmounts(
        address user,
        uint256[] calldata tierIds
    ) external view returns (uint256[] memory vestingWithdrawAmounts) {
        vestingWithdrawAmounts = new uint256[](tierIds.length);

        for (uint256 i = 0; i < tierIds.length; i++) {
            vestingWithdrawAmounts[i] = _getTier(tierIds[i]).getVestingWithdrawAmount(user);
        }
    }

    function getRecoverAmounts(
        uint256[] calldata tierIds
    ) external view returns (uint256[] memory recoveringAmounts) {
        recoveringAmounts = new uint256[](tierIds.length);

        for (uint256 i = 0; i < recoveringAmounts.length; i++) {
            recoveringAmounts[i] = _getTier(tierIds[i]).getRecoverAmount();
        }
    }

    function getTierViews(
        uint256 offset,
        uint256 limit
    ) external view returns (TierView[] memory tierViews) {
        uint256 to = (offset + limit).min(latestTierId).max(offset);

        tierViews = new TierView[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            Tier storage tier = _tiers[i + 1];

            tierViews[i - offset] = TierView({
                tierInitParams: tier.tierInitParams,
                tierInfo: tier.tierInfo
            });
        }
    }

    function getUserViews(
        address user,
        uint256[] calldata tierIds
    ) external view returns (UserView[] memory userViews) {
        userViews = new UserView[](tierIds.length);

        for (uint256 i = 0; i < userViews.length; i++) {
            Tier storage tier = _getTier(tierIds[i]);

            userViews[i] = UserView({
                canParticipate: tier.canParticipate(tierIds[i], user),
                purchaseView: tier.getPurchaseView(user),
                vestingUserView: tier.getVestingUserView(user)
            });
        }
    }

    function uri(uint256 tierId) public view override returns (string memory) {
        return _tiers[tierId].tierInfo.uri;
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        require(from == address(0), "TSP: only for minting");

        for (uint256 i = 0; i < ids.length; i++) {
            require(balanceOf(to, ids[i]) == 0, "TSP: balance can be only 0 or 1");
        }
    }

    function _onlyGov() internal view {
        require(govAddress == address(0) || msg.sender == govAddress, "TSP: not a Gov contract");
    }

    function _getTier(uint256 tierId) private view returns (Tier storage tier) {
        tier = _tiers[tierId];

        require(tier.tierInitParams.saleTokenAddress != address(0), "TSP: tier does not exist");
    }

    function _getActiveTier(uint256 tierId) private view returns (Tier storage tier) {
        tier = _getTier(tierId);

        require(!_tiers[tierId].tierInfo.isOff, "TSP: tier is off");
    }
}
