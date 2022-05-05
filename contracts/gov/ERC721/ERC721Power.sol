// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/ERC721/IERC721Power.sol";

import "../../core/Globals.sol";

contract ERC721Power is IERC721Power, ERC721Enumerable, Ownable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /// @notice Contain detail nft information
    mapping(uint256 => NftInfo) public nftInfoToNft;

    uint256 public maxPower;
    mapping(uint256 => uint256) public maxPowerToNft;

    address public collateralToken;

    uint256 public totalCollateralAmount;
    uint256 public requiredCollateralAmount;
    mapping(uint256 => uint256) public requiredCollateralAmountToNft;

    string public baseURI;
    uint64 public powerCalcStartTimestamp;
    uint256 public reductionPercent;

    modifier onlyBeforePowerCalc() {
        require(
            block.timestamp < powerCalcStartTimestamp,
            "NftToken: power calculation already begun."
        );
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        uint64 _powerCalcStartTimestamp
    ) ERC721(name, symbol) {
        powerCalcStartTimestamp = _powerCalcStartTimestamp;
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
        require(_reductionPercent > 0, "NftToken: reduction percent can't be a zero.");
        require(
            _reductionPercent < PERCENTAGE_100,
            "NftToken: reduction percent can't be a 100%."
        );

        reductionPercent = _reductionPercent;
    }

    function setMaxPower(uint256 _maxPower) external override onlyOwner onlyBeforePowerCalc {
        require(_maxPower > 0, "NftToken: max power can't be a zero (1).");

        maxPower = _maxPower;
    }

    function setMaxPower(uint256 _maxPower, uint256 tokenId)
        external
        override
        onlyOwner
        onlyBeforePowerCalc
    {
        require(_maxPower > 0, "NftToken: max power can't be a zero (2).");

        maxPowerToNft[tokenId] = _maxPower;
    }

    function setCollateralToken(address _collateralToken)
        external
        override
        onlyOwner
        onlyBeforePowerCalc
    {
        require(_collateralToken != address(0), "NftToken: zero address.");

        collateralToken = _collateralToken;
    }

    function setRequiredCollateralAmount(uint256 amount)
        external
        override
        onlyOwner
        onlyBeforePowerCalc
    {
        require(amount > 0, "NftToken: required collateral amount can't be a zero (1).");

        requiredCollateralAmount = amount;
    }

    function setRequiredCollateralAmount(uint256 amount, uint256 tokenId)
        external
        override
        onlyOwner
        onlyBeforePowerCalc
    {
        require(amount > 0, "NftToken: required collateral amount can't be a zero (2).");

        requiredCollateralAmountToNft[tokenId] = amount;
    }

    function safeMint(address to, uint256 tokenId)
        external
        override
        onlyOwner
        onlyBeforePowerCalc
    {
        require(getMaxPowerForNft(tokenId) > 0, "NftToken: max power for nft isn't set.");
        require(
            getRequiredCollateralAmountForNft(tokenId) > 0,
            "NftToken: required collateral amount for nft isn't set."
        );

        _safeMint(to, tokenId, "");
    }

    function setBaseUri(string memory _baseUri) external override onlyOwner {
        baseURI = _baseUri;
    }

    function addCollateral(uint256 amount, uint256 tokenId) external override {
        require(ownerOf(tokenId) == msg.sender, "NftToken: sender isn't a nft owner (1).");

        IERC20(collateralToken).safeTransferFrom(msg.sender, address(this), amount);

        uint256 currentCollateralAmount = nftInfoToNft[tokenId].currentCollateral;
        _recalculateNftPower(tokenId, currentCollateralAmount);

        nftInfoToNft[tokenId].currentCollateral = currentCollateralAmount + amount;
        totalCollateralAmount += amount;
    }

    function removeCollateral(uint256 amount, uint256 tokenId) external override {
        require(ownerOf(tokenId) == msg.sender, "NftToken: sender isn't a nft owner (2).");

        uint256 currentCollateralAmount = nftInfoToNft[tokenId].currentCollateral;
        amount = amount.min(currentCollateralAmount);

        require(amount > 0, "NftToken: nothing to remove.");

        _recalculateNftPower(tokenId, currentCollateralAmount);

        nftInfoToNft[tokenId].currentCollateral = currentCollateralAmount - amount;
        totalCollateralAmount -= amount;

        IERC20(collateralToken).safeTransfer(msg.sender, amount);
    }

    function recalculateNftPower(uint256 tokenId) external override returns (uint256) {
        return _recalculateNftPower(tokenId, nftInfoToNft[tokenId].currentCollateral);
    }

    function getMaxPowerForNft(uint256 tokenId) public view override returns (uint256) {
        uint256 maxPowerForNft = maxPowerToNft[tokenId];

        return maxPowerForNft == 0 ? maxPower : maxPowerForNft;
    }

    function getRequiredCollateralAmountForNft(uint256 tokenId)
        public
        view
        override
        returns (uint256)
    {
        uint256 requiredCollateralAmountForNft = requiredCollateralAmountToNft[tokenId];

        return
            requiredCollateralAmountForNft == 0
                ? requiredCollateralAmount
                : requiredCollateralAmountForNft;
    }

    function getNftInfo(uint256 tokenId)
        external
        view
        override
        returns (
            uint64,
            uint256,
            uint256
        )
    {
        return (
            nftInfoToNft[tokenId].lastUpdate,
            nftInfoToNft[tokenId].currentPower,
            nftInfoToNft[tokenId].currentCollateral
        );
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
        uint256 minNftPower = (currentCollateral * maxNftPower) /
            getRequiredCollateralAmountForNft(tokenId);
        minNftPower = maxNftPower.min(minNftPower);

        // Get last update and current power. Or set them to default if it is first iteration.
        uint64 lastUpdate = nftInfoToNft[tokenId].lastUpdate;
        uint256 currentPower = nftInfoToNft[tokenId].currentPower;

        if (lastUpdate == 0) {
            lastUpdate = powerCalcStartTimestamp;
            currentPower = maxNftPower;
        }

        // Calculate reduction amount
        uint256 powerReductionPercent = reductionPercent * (block.timestamp - lastUpdate);
        uint256 powerReduction = currentPower.min(
            (maxNftPower * powerReductionPercent) / PERCENTAGE_100
        );

        uint256 newPotentialPower = currentPower - powerReduction;

        nftInfoToNft[tokenId].lastUpdate = uint64(block.timestamp);

        if (minNftPower <= newPotentialPower) {
            nftInfoToNft[tokenId].currentPower = newPotentialPower;

            return newPotentialPower;
        }

        if (minNftPower <= currentPower) {
            nftInfoToNft[tokenId].currentPower = minNftPower;

            return minNftPower;
        }

        return currentPower;
    }

    function withdrawStuckERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));

        if (token == collateralToken) {
            amount = amount.min(balance - totalCollateralAmount);
        } else {
            amount = amount.min(balance);
        }

        require(amount > 0, "NftToken: nothing to withdraw.");

        IERC20(token).safeTransfer(to, amount);
    }

    function withdrawNative(address to) external onlyOwner {
        payable(to).transfer(address(this).balance);
    }
}
