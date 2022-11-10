// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/ERC721/IERC721Power.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/utils/TokenBalance.sol";

import "../../core/Globals.sol";

contract ERC721Power is IERC721Power, ERC721Enumerable, Ownable {
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

    modifier onlyBeforePowerCalc() {
        require(
            block.timestamp < powerCalcStartTimestamp,
            "ERC721Power: power calculation already begun"
        );
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        uint64 startTimestamp
    ) ERC721(name, symbol) {
        powerCalcStartTimestamp = startTimestamp;
    }

    function setReductionPercent(uint256 _reductionPercent)
        external
        onlyOwner
        onlyBeforePowerCalc
    {
        require(_reductionPercent > 0, "ERC721Power: reduction percent can't be zero");
        require(
            _reductionPercent < PERCENTAGE_100,
            "ERC721Power: reduction percent can't be a 100%"
        );

        reductionPercent = _reductionPercent;
    }

    function setMaxPower(uint256 _maxPower) external onlyOwner onlyBeforePowerCalc {
        require(_maxPower > 0, "ERC721Power: max power can't be zero");

        maxPower = _maxPower;
    }

    function setNftMaxPower(uint256 _maxPower, uint256 tokenId)
        external
        onlyOwner
        onlyBeforePowerCalc
    {
        require(_maxPower > 0, "ERC721Power: max power can't be zero");

        nftInfos[tokenId].maxPower = _maxPower;
    }

    function setCollateralToken(address _collateralToken) external onlyOwner onlyBeforePowerCalc {
        require(_collateralToken != address(0), "ERC721Power: zero address");

        collateralToken = _collateralToken;
    }

    function setRequiredCollateral(uint256 amount) external onlyOwner onlyBeforePowerCalc {
        require(amount > 0, "ERC721Power: required collateral amount can't be zero");

        requiredCollateral = amount;
    }

    function setNftRequiredCollateral(uint256 amount, uint256 tokenId)
        external
        onlyOwner
        onlyBeforePowerCalc
    {
        require(amount > 0, "ERC721Power: required collateral amount can't be zero");

        nftInfos[tokenId].requiredCollateral = amount;
    }

    function safeMint(address to, uint256 tokenId) external onlyOwner onlyBeforePowerCalc {
        require(getMaxPowerForNft(tokenId) > 0, "ERC721Power: max power for nft isn't set");
        require(
            getRequiredCollateralForNft(tokenId) > 0,
            "ERC721Power: required collateral amount for nft isn't set"
        );

        _safeMint(to, tokenId, "");
    }

    function setBaseUri(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    function addCollateral(uint256 amount, uint256 tokenId) external override {
        require(ownerOf(tokenId) == msg.sender, "ERC721Power: sender isn't an nft owner");

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
        require(
            amount > 0 && amount <= nftInfos[tokenId].currentCollateral,
            "ERC721Power: wrong collateral amount"
        );

        recalculateNftPower(tokenId);

        nftInfos[tokenId].currentCollateral -= amount;
        totalCollateral -= amount;

        IERC20(collateralToken).safeTransfer(
            msg.sender,
            amount.from18(ERC20(collateralToken).decimals())
        );
    }

    function recalculateNftPower(uint256 tokenId)
        public
        override
        returns (uint256 newPower, uint256 collateral)
    {
        if (block.timestamp <= powerCalcStartTimestamp) {
            return (0, 0);
        }

        (newPower, collateral) = getNftPower(tokenId);

        nftInfos[tokenId].lastUpdate = uint64(block.timestamp);
        nftInfos[tokenId].currentPower = newPower;
    }

    function getMaxPowerForNft(uint256 tokenId) public view override returns (uint256) {
        uint256 maxPowerForNft = nftInfos[tokenId].maxPower;

        return maxPowerForNft == 0 ? maxPower : maxPowerForNft;
    }

    function getRequiredCollateralForNft(uint256 tokenId) public view override returns (uint256) {
        uint256 requiredCollateralForNft = nftInfos[tokenId].requiredCollateral;

        return requiredCollateralForNft == 0 ? requiredCollateral : requiredCollateralForNft;
    }

    function getNftPower(uint256 tokenId) public view override returns (uint256, uint256) {
        if (block.timestamp <= powerCalcStartTimestamp) {
            return (0, 0);
        }

        uint256 collateral = nftInfos[tokenId].currentCollateral;

        // Calculate the minimum possible power based on the collateral of the nft
        uint256 maxNftPower = getMaxPowerForNft(tokenId);
        uint256 minNftPower = maxNftPower.ratio(collateral, getRequiredCollateralForNft(tokenId));
        minNftPower = maxNftPower.min(minNftPower);

        // Get last update and current power. Or set them to default if it is first iteration
        uint64 lastUpdate = nftInfos[tokenId].lastUpdate;
        uint256 currentPower = nftInfos[tokenId].currentPower;

        if (lastUpdate == 0) {
            lastUpdate = powerCalcStartTimestamp;
            currentPower = maxNftPower;
        }

        // Calculate reduction amount
        uint256 powerReductionPercent = reductionPercent * (block.timestamp - lastUpdate);
        uint256 powerReduction = currentPower.min(maxNftPower.percentage(powerReductionPercent));
        uint256 newPotentialPower = currentPower - powerReduction;

        if (minNftPower <= newPotentialPower) {
            return (newPotentialPower, collateral);
        }

        if (minNftPower <= currentPower) {
            return (minNftPower, collateral);
        }

        return (currentPower, collateral);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(IERC165, ERC721Enumerable)
        returns (bool)
    {
        return
            interfaceId == type(IERC721Power).interfaceId || super.supportsInterface(interfaceId);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }
}
