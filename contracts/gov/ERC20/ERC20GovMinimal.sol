// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract ERC20GovMinimal is ERC20Upgradeable {
    struct InitMint {
        address user;
        uint256 amount;
    }

    function __ERC20GovMinimal_init(
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
