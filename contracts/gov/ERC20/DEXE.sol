// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import "@solarity/solidity-lib/access-control/MultiOwnable.sol";

contract DEXE is ERC20Upgradeable, MultiOwnable {
    constructor(string memory name, string memory symbol) {
        __DEXE_init(name, symbol);
    }

    function __DEXE_init(string memory name, string memory symbol) public initializer {
        __ERC20_init(name, symbol);
        __MultiOwnable_init();
    }

    function decimals() public view override returns (uint8) {
        return 18;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
