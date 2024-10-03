// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract ERC20GovMintable is ERC20Upgradeable, ERC20BurnableUpgradeable, OwnableUpgradeable {
    struct InitMint {
        address user;
        uint256 amount;
    }

    function __ERC20GovMintable_init(
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
}
