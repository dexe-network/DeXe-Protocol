// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    uint8 internal _decimals;
    bool internal _allowMint;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimalPlaces
    ) ERC20(name, symbol) {
        _decimals = decimalPlaces;
        _allowMint = true;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 _amount) public {
        require(_allowMint, "ERC20Mock: minting is off");

        _mint(to, _amount);
    }

    function burn(address from, uint256 _amount) public {
        _burn(from, _amount);
    }

    function toggleMint() public {
        _allowMint = !_allowMint;
    }
}
