// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";

contract ERC20GovCappedPausable is
    ERC20Upgradeable,
    OwnableUpgradeable,
    ERC20BurnableUpgradeable,
    ERC20CappedUpgradeable,
    ERC20PausableUpgradeable
{
    struct InitMint {
        address user;
        uint256 amount;
    }

    function __ERC20GovCappedPausable_init(
        string calldata name,
        string calldata symbol,
        InitMint[] calldata distributions,
        address newOwner,
        uint256 cap_
    ) external initializer {
        __ERC20_init(name, symbol);

        __Ownable_init();
        transferOwnership(newOwner);

        __ERC20Capped_init(cap_);

        for (uint256 i = 0; i < distributions.length; i++) {
            _mint(distributions[i].user, distributions[i].amount);
        }
    }

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _mint(
        address account,
        uint256 amount
    ) internal virtual override(ERC20Upgradeable, ERC20CappedUpgradeable) {
        ERC20CappedUpgradeable._mint(account, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        ERC20PausableUpgradeable._beforeTokenTransfer(from, to, amount);
    }
}
