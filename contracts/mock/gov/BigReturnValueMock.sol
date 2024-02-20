// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BigReturnValueMock {
    function execute() external returns (bytes memory) {
        return
            hex"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    }
}
