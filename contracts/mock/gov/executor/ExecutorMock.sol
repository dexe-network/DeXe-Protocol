// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract ExecutorMock {
    uint8 public counter;

    function execute() external {
        counter++;
    }
}
