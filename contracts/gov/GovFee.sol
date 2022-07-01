// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/gov/IGovFee.sol";

import "./GovVote.sol";

abstract contract GovFee is IGovFee, OwnableUpgradeable, GovVote {
    using SafeERC20 for IERC20;
    using Math for uint256;
    using Math for uint64;
    using MathHelper for uint256;

    uint64 private _deployedAt;

    uint256 public feePercentage;

    /// @dev zero address - native token
    mapping(address => uint64) public lastUpdate; // token address => last update

    function __GovFee_init(
        address govSettingAddress,
        address govUserKeeperAddress,
        address validatorsAddress,
        uint256 _votesLimit,
        uint256 _feePercentage
    ) internal {
        __GovVote_init(govSettingAddress, govUserKeeperAddress, validatorsAddress, _votesLimit);
        __Ownable_init();

        require(
            _feePercentage <= PERCENTAGE_100,
            "GovFee: `_feePercentage` can't be more than 100%"
        );

        _deployedAt = uint64(block.timestamp);
        feePercentage = _feePercentage;
    }

    function withdrawFee(address tokenAddress, address recipient) external override onlyOwner {
        uint64 _lastUpdate = uint64(lastUpdate[tokenAddress].max(_deployedAt));

        lastUpdate[tokenAddress] = uint64(block.timestamp);

        uint256 balance;
        uint256 toWithdraw;

        if (tokenAddress != address(0)) {
            balance = IERC20(tokenAddress).balanceOf(address(this));
        } else {
            balance = address(this).balance;
        }

        uint256 fee = feePercentage.ratio(block.timestamp - _lastUpdate, 1 days * 365);
        toWithdraw = balance.min(balance.percentage(fee));

        require(toWithdraw > 0, "GFee: nothing to withdraw");

        if (tokenAddress != address(0)) {
            IERC20(tokenAddress).safeTransfer(recipient, toWithdraw);
        } else {
            payable(recipient).transfer(toWithdraw);
        }
    }
}
