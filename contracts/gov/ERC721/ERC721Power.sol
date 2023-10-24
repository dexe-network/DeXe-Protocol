// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@solarity/solidity-lib/libs/decimals/DecimalsConverter.sol";

import "../../interfaces/gov/ERC721/IERC721Power.sol";

import "../../libs/math/MathHelper.sol";
import "../../libs/utils/TokenBalance.sol";

import "../../core/Globals.sol";

contract ERC721Power is
    IERC721Power,
    ERC721EnumerableUpgradeable,
    ERC721URIStorageUpgradeable,
    OwnableUpgradeable
{
    using SafeERC20 for IERC20;
    using Math for uint256;
    using MathHelper for uint256;
    using DecimalsConverter for *;
    using TokenBalance for address;

    uint64 public powerCalcStartTimestamp;

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

    function mint(
        address to,
        uint256 tokenId,
        string calldata uri_
    ) external onlyOwner onlyBeforePowerCalc {
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri_);

        totalPower += getMaxPowerForNft(tokenId);
    }

    function setTokenURI(uint256 tokenId, string calldata uri_) external onlyOwner {
        _setTokenURI(tokenId, uri_);
    }

    function addCollateral(uint256 amount, uint256 tokenId) external override {
        require(ownerOf(tokenId) == msg.sender, "ERC721Power: sender isn't an nft owner");
        require(amount > 0, "ERC721Power: wrong collateral amount");

        IERC20(collateralToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount.from18(collateralToken.decimals())
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
            amount.from18(collateralToken.decimals())
        );
    }

    function recalculateNftPower(uint256 tokenId) public override returns (uint256 newPower) {
        if (!_isActiveNft(tokenId)) {
            return 0;
        }

        newPower = getNftPower(tokenId);

        NftInfo storage nftInfo = nftInfos[tokenId];

        totalPower -= nftInfo.lastUpdate != 0 ? nftInfo.currentPower : getMaxPowerForNft(tokenId);
        totalPower += newPower;

        nftInfo.lastUpdate = uint64(block.timestamp);
        nftInfo.currentPower = newPower;
    }

    function getMinPowerForNft(uint256 tokenId) public view returns (uint256) {
        if (!_isActiveNft(tokenId)) {
            return 0;
        }

        uint256 maxNftPower = getMaxPowerForNft(tokenId);

        return
            maxNftPower
                .ratio(nftInfos[tokenId].currentCollateral, getRequiredCollateralForNft(tokenId))
                .min(maxNftPower);
    }

    function getMaxPowerForNft(uint256 tokenId) public view override returns (uint256) {
        if (!_isActiveNft(tokenId)) {
            return 0;
        }

        uint256 maxPowerForNft = nftInfos[tokenId].maxPower;

        return maxPowerForNft == 0 ? maxPower : maxPowerForNft;
    }

    function getRequiredCollateralForNft(uint256 tokenId) public view override returns (uint256) {
        uint256 requiredCollateralForNft = nftInfos[tokenId].requiredCollateral;

        return requiredCollateralForNft == 0 ? requiredCollateral : requiredCollateralForNft;
    }

    function getNftPower(uint256 tokenId) public view override returns (uint256) {
        if (!_isActiveNft(tokenId)) {
            return 0;
        }

        uint256 collateral = nftInfos[tokenId].currentCollateral;

        // Calculate the minimum possible power based on the collateral of the nft
        uint256 maxNftPower = getMaxPowerForNft(tokenId);
        uint256 minNftPower = getMinPowerForNft(tokenId);

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
            return newPotentialPower;
        }

        if (minNftPower <= currentPower) {
            return minNftPower;
        }

        return currentPower;
    }

    function tokenURI(
        uint256 tokenId
    )
        public
        view
        override(ERC721URIStorageUpgradeable, ERC721Upgradeable)
        returns (string memory)
    {
        return ERC721URIStorageUpgradeable.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721URIStorageUpgradeable, ERC721EnumerableUpgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return
            interfaceId == type(IERC721Power).interfaceId || super.supportsInterface(interfaceId);
    }

    function _burn(
        uint256 tokenId
    ) internal override(ERC721URIStorageUpgradeable, ERC721Upgradeable) {
        ERC721URIStorageUpgradeable._burn(tokenId);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721EnumerableUpgradeable, ERC721Upgradeable) {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);

        recalculateNftPower(tokenId);
    }

    function _isActiveNft(uint256 tokenId) internal view returns (bool) {
        return _exists(tokenId) && block.timestamp >= powerCalcStartTimestamp;
    }

    function _onlyBeforePowerCalc() internal view {
        require(
            block.timestamp < powerCalcStartTimestamp,
            "ERC721Power: power calculation already begun"
        );
    }
}
