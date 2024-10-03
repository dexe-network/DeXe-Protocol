// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ExecutorMock {
    bool public stateFlag;

    function execute(bool success) external {
        if (success) {
            stateFlag = true;
            return;
        } else {
            revert();
        }
    }
}
