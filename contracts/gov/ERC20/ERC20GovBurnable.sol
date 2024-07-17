// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";

contract ERC20GovBurnable is ERC20Upgradeable, ERC20BurnableUpgradeable {
    struct InitMint {
        address user;
        uint256 amount;
    }

    function __ERC20GovBurnable_init(
        string calldata name,
        string calldata symbol,
        InitMint[] calldata distributions
    ) external initializer {
        __ERC20_init(name, symbol);

        for (uint256 i = 0; i < distributions.length; i++) {
            _mint(distributions[i].user, distributions[i].amount);
        }
    }
}
