// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/ERC721/IERC721Power.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/utils/TokenBalance.sol";

import "../../core/Globals.sol";

contract ERC721Power is IERC721Power, ERC721EnumerableUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;
    using Math for uint256;
    using MathHelper for uint256;
    using DecimalsConverter for uint256;
    using TokenBalance for address;

    uint64 public powerCalcStartTimestamp;
    string public baseURI;

    mapping(uint256 => NftInfo) public nftInfos; // tokenId => info

    uint256 public reductionPercent;

    address public collateralToken;
    uint256 public totalCollateral;

    uint256 public maxPower;
    uint256 public requiredCollateral;

    uint256 public totalPower;

    modifier onlyBeforePowerCalc() {
        _onlyBeforePowerCalc();
        _;
    }

    function recalculateNftPower(uint256 tokenId) public override returns (uint256 newPower) {
        if (block.timestamp < powerCalcStartTimestamp) {
            return 0;
        }

        newPower = getNftPower(tokenId);

        NftInfo storage nftInfo = nftInfos[tokenId];

        totalPower -= nftInfo.lastUpdate != 0 ? nftInfo.currentPower : getMaxPowerForNft(tokenId);
        totalPower += newPower;

        nftInfo.lastUpdate = uint64(block.timestamp);
        nftInfo.currentPower = newPower;
    }

    function __ERC721Power_init(
        string calldata name,
        string calldata symbol,
        uint64 startTimestamp,
        address _collateralToken,
        uint256 _maxPower,
        uint256 _reductionPercent,
        uint256 _requiredCollateral
    ) external initializer {
        __Ownable_init();
        __ERC721Enumerable_init();
        __ERC721_init(name, symbol);

        require(_collateralToken != address(0), "ERC721Power: zero address");
        require(_maxPower > 0, "ERC721Power: max power can't be zero");
        require(_reductionPercent > 0, "ERC721Power: reduction percent can't be zero");
        require(_reductionPercent < PERCENTAGE_100, "ERC721Power: reduction can't be 100%");
        require(_requiredCollateral > 0, "ERC721Power: required collateral amount can't be zero");

        powerCalcStartTimestamp = startTimestamp;

        collateralToken = _collateralToken;
        maxPower = _maxPower;
        reductionPercent = _reductionPercent;
        requiredCollateral = _requiredCollateral;
    }

    function setNftMaxPower(
        uint256 _maxPower,
        uint256 tokenId
    ) external onlyOwner onlyBeforePowerCalc {
        require(_maxPower > 0, "ERC721Power: max power can't be zero");

        if (_exists(tokenId)) {
            totalPower -= getMaxPowerForNft(tokenId);
            totalPower += _maxPower;
        }

        nftInfos[tokenId].maxPower = _maxPower;
    }

    function setNftRequiredCollateral(
        uint256 amount,
        uint256 tokenId
    ) external onlyOwner onlyBeforePowerCalc {
        require(amount > 0, "ERC721Power: required collateral amount can't be zero");

        nftInfos[tokenId].requiredCollateral = amount;
    }

    function safeMint(address to, uint256 tokenId) external onlyOwner onlyBeforePowerCalc {
        _safeMint(to, tokenId, "");

        totalPower += getMaxPowerForNft(tokenId);
    }

    function setBaseUri(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    function addCollateral(uint256 amount, uint256 tokenId) external override {
        require(ownerOf(tokenId) == msg.sender, "ERC721Power: sender isn't an nft owner");
        require(amount > 0, "ERC721Power: wrong collateral amount");

        IERC20(collateralToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount.from18(ERC20(collateralToken).decimals())
        );

        recalculateNftPower(tokenId);

        nftInfos[tokenId].currentCollateral += amount;
        totalCollateral += amount;
    }

    function removeCollateral(uint256 amount, uint256 tokenId) external override {
        require(ownerOf(tokenId) == msg.sender, "ERC721Power: sender isn't an nft owner");

        NftInfo storage nftInfo = nftInfos[tokenId];

        require(
            amount > 0 && amount <= nftInfo.currentCollateral,
            "ERC721Power: wrong collateral amount"
        );

        recalculateNftPower(tokenId);

        nftInfo.currentCollateral -= amount;
        totalCollateral -= amount;

        IERC20(collateralToken).safeTransfer(
            msg.sender,
            amount.from18(ERC20(collateralToken).decimals())
        );
    }

    function getMaxPowerForNft(uint256 tokenId) public view override returns (uint256) {
        uint256 maxPowerForNft = nftInfos[tokenId].maxPower;

        return maxPowerForNft == 0 ? maxPower : maxPowerForNft;
    }

    function getRequiredCollateralForNft(uint256 tokenId) public view override returns (uint256) {
        uint256 requiredCollateralForNft = nftInfos[tokenId].requiredCollateral;

        return requiredCollateralForNft == 0 ? requiredCollateral : requiredCollateralForNft;
    }

    function getNftPower(uint256 tokenId) public view override returns (uint256) {
        if (block.timestamp <= powerCalcStartTimestamp) {
            return 0;
        }

        NftInfo storage nftInfo = nftInfos[tokenId];

        uint256 collateral = nftInfo.currentCollateral;

        // Calculate the minimum possible power based on the collateral of the nft
        uint256 maxNftPower = getMaxPowerForNft(tokenId);
        uint256 minNftPower = maxNftPower.ratio(collateral, getRequiredCollateralForNft(tokenId));
        minNftPower = maxNftPower.min(minNftPower);

        // Get last update and current power. Or set them to default if it is first iteration
        uint64 lastUpdate = nftInfo.lastUpdate;
        uint256 currentPower = nftInfo.currentPower;

        if (lastUpdate == 0) {
            lastUpdate = powerCalcStartTimestamp;
            currentPower = maxNftPower;
        }

        // Calculate reduction amount
        uint256 powerReductionPercent = reductionPercent * (block.timestamp - lastUpdate);
        uint256 powerReduction = currentPower.min(maxNftPower.percentage(powerReductionPercent));
        uint256 newPotentialPower = currentPower - powerReduction;

        if (minNftPower <= newPotentialPower) {
            return newPotentialPower;
        }

        if (minNftPower <= currentPower) {
            return minNftPower;
        }

        return currentPower;
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(IERC165Upgradeable, ERC721EnumerableUpgradeable)
        returns (bool)
    {
        return
            interfaceId == type(IERC721Power).interfaceId || super.supportsInterface(interfaceId);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal override {
        super._beforeTokenTransfer(from, to, tokenId);

        recalculateNftPower(tokenId);
    }

    function _onlyBeforePowerCalc() internal view {
        require(
            block.timestamp < powerCalcStartTimestamp,
            "ERC721Power: power calculation already begun"
        );
    }
}
