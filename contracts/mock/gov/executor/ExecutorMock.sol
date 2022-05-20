// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

contract ExecutorMock {
    uint8 public counter;

    function execute() external {
        counter++;
    }
}
