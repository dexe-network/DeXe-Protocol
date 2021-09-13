// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "hardhat/console.sol";

import "@openzeppelin/contracts/utils/Strings.sol";

contract HelloWorld {
    using Strings for uint256;

    uint256 private greeting;

    constructor(uint256 _greeting) {
        console.log("Deploying a Greeter with greeting:", _greeting.toString());
        greeting = _greeting;
    }

    function greet() public view returns (uint256) {
        return greeting;
    }

    function setGreeting(uint256 _greeting) public {
        console.log(
            "Changing greeting from '%s' to '%s'",
            greeting.toString(),
            _greeting.toString()
        );
        greeting = _greeting;
    }
}
