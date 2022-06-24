// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/ERC721/IERC721Power.sol";

import "../../libs/MathHelper.sol";

import "../../core/Globals.sol";

contract ERC721Power is IERC721Power, ERC721Enumerable, Ownable {
    using SafeERC20 for IERC20;
    using Math for uint256;
    using MathHelper for uint256;
    using DecimalsConverter for uint256;

    uint64 public powerCalcStartTimestamp;
    string public baseURI;

    /// @notice Contain detail nft information
    mapping(uint256 => NftInfo) public nftInfos; // tokenId => info

    uint256 public reductionPercent;

    address public collateralToken;
    uint256 public totalCollateral;

    uint256 public maxPower;
    uint256 public requiredCollateral;

    modifier onlyBeforePowerCalc() {
        require(
            block.timestamp < powerCalcStartTimestamp,
            "NftToken: power calculation already begun"
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

    function setReductionPercent(uint256 _reductionPercent)
        external
        override
        onlyOwner
        onlyBeforePowerCalc
    {
        require(_reductionPercent > 0, "NftToken: reduction percent can't be a zero");
        require(_reductionPercent < PERCENTAGE_100, "NftToken: reduction percent can't be a 100%");

        reductionPercent = _reductionPercent;
    }

    function setMaxPower(uint256 _maxPower) external override onlyOwner onlyBeforePowerCalc {
        require(_maxPower > 0, "NftToken: max power can't be zero (1)");

        maxPower = _maxPower;
    }

    function setNftMaxPower(uint256 _maxPower, uint256 tokenId)
        external
        override
        onlyOwner
        onlyBeforePowerCalc
    {
        require(_maxPower > 0, "NftToken: max power can't be zero (2)");

        nftInfos[tokenId].maxPower = _maxPower;
    }

    function setCollateralToken(address _collateralToken)
        external
        override
        onlyOwner
        onlyBeforePowerCalc
    {
        require(_collateralToken != address(0), "NftToken: zero address");

        collateralToken = _collateralToken;
    }

    function setRequiredCollateral(uint256 amount)
        external
        override
        onlyOwner
        onlyBeforePowerCalc
    {
        require(amount > 0, "NftToken: required collateral amount can't be zero (1)");

        requiredCollateral = amount;
    }

    function setNftRequiredCollateral(uint256 amount, uint256 tokenId)
        external
        override
        onlyOwner
        onlyBeforePowerCalc
    {
        require(amount > 0, "NftToken: required collateral amount can't be zero (2)");

        nftInfos[tokenId].requiredCollateral = amount;
    }

    function safeMint(address to, uint256 tokenId)
        external
        override
        onlyOwner
        onlyBeforePowerCalc
    {
        require(getMaxPowerForNft(tokenId) > 0, "NftToken: max power for nft isn't set");
        require(
            getRequiredCollateralForNft(tokenId) > 0,
            "NftToken: required collateral amount for nft isn't set"
        );

        _safeMint(to, tokenId, "");
    }

    function addCollateral(uint256 amount, uint256 tokenId) external override {
        require(ownerOf(tokenId) == msg.sender, "NftToken: sender isn't an nft owner (1)");

        IERC20(collateralToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount.from18(ERC20(collateralToken).decimals())
        );

        uint256 currentCollateralAmount = nftInfos[tokenId].currentCollateral;
        _recalculateNftPower(tokenId, currentCollateralAmount);

        nftInfos[tokenId].currentCollateral = currentCollateralAmount + amount;
        totalCollateral += amount;
    }

    function removeCollateral(uint256 amount, uint256 tokenId) external override {
        require(ownerOf(tokenId) == msg.sender, "NftToken: sender isn't an nft owner (2)");

        uint256 currentCollateralAmount = nftInfos[tokenId].currentCollateral;
        amount = amount.min(currentCollateralAmount);

        require(amount > 0, "NftToken: nothing to remove");

        _recalculateNftPower(tokenId, currentCollateralAmount);

        nftInfos[tokenId].currentCollateral = currentCollateralAmount - amount;
        totalCollateral -= amount;

        IERC20(collateralToken).safeTransfer(
            msg.sender,
            amount.from18(ERC20(collateralToken).decimals())
        );
    }

    function recalculateNftPower(uint256 tokenId) external override returns (uint256) {
        return _recalculateNftPower(tokenId, nftInfos[tokenId].currentCollateral);
    }

    function getMaxPowerForNft(uint256 tokenId) public view override returns (uint256) {
        uint256 maxPowerForNft = nftInfos[tokenId].maxPower;

        return maxPowerForNft == 0 ? maxPower : maxPowerForNft;
    }

    function getRequiredCollateralForNft(uint256 tokenId) public view override returns (uint256) {
        uint256 requiredCollateralForNft = nftInfos[tokenId].requiredCollateral;

        return requiredCollateralForNft == 0 ? requiredCollateral : requiredCollateralForNft;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function _recalculateNftPower(uint256 tokenId, uint256 currentCollateral)
        private
        returns (uint256)
    {
        if (block.timestamp <= powerCalcStartTimestamp) {
            return 0;
        }

        // Calculate the minimum possible power based on the collateral of the nft
        uint256 maxNftPower = getMaxPowerForNft(tokenId);
        uint256 minNftPower = maxNftPower.ratio(
            currentCollateral,
            getRequiredCollateralForNft(tokenId)
        );
        minNftPower = maxNftPower.min(minNftPower);

        // Get last update and current power. Or set them to default if it is first iteration
        uint64 lastUpdate = nftInfos[tokenId].lastUpdate;
        uint256 currentPower = nftInfos[tokenId].currentPower;

        if (lastUpdate == 0) {
            lastUpdate = powerCalcStartTimestamp;
            currentPower = maxNftPower;
        }

        nftInfos[tokenId].lastUpdate = uint64(block.timestamp);

        // Calculate reduction amount
        uint256 powerReductionPercent = reductionPercent * (block.timestamp - lastUpdate);
        uint256 powerReduction = currentPower.min(maxNftPower.percentage(powerReductionPercent));
        uint256 newPotentialPower = currentPower - powerReduction;

        if (minNftPower <= newPotentialPower) {
            nftInfos[tokenId].currentPower = newPotentialPower;

            return newPotentialPower;
        }

        if (minNftPower <= currentPower) {
            nftInfos[tokenId].currentPower = minNftPower;

            return minNftPower;
        }

        return currentPower;
    }

    function setBaseUri(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    function withdrawStuckERC20(address token, address to) external onlyOwner {
        uint256 toWithdraw = IERC20(token).balanceOf(address(this));

        if (token == collateralToken) {
            toWithdraw -= totalCollateral;
        }

        require(toWithdraw > 0, "NftToken: nothing to withdraw");

        IERC20(token).safeTransfer(to, toWithdraw);
    }
}
