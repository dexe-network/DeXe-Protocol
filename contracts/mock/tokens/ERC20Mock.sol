// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20("Mock", "MK") {
    function mint(uint256 _amount, address to) public {
        _mint(to, _amount);
    }

    function burn(uint256 _amount, address to) public {
        _burn(to, _amount);
    }
}
