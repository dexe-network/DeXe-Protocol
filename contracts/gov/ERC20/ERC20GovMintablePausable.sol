// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";

contract ERC20GovMintablePausable is
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    OwnableUpgradeable,
    ERC20PausableUpgradeable
{
    struct InitMint {
        address user;
        uint256 amount;
    }

    function __ERC20GovMintablePausable_init(
        string calldata name,
        string calldata symbol,
        InitMint[] calldata distributions,
        address newOwner
    ) external initializer {
        __ERC20_init(name, symbol);

        __Ownable_init();
        transferOwnership(newOwner);

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

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        ERC20PausableUpgradeable._beforeTokenTransfer(from, to, amount);
    }
}
