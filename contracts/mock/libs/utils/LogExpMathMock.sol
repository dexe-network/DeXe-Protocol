// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../libs/math/LogExpMath.sol";

contract LogExpMathMock {
    using LogExpMath for *;

    function pow(uint256 x, uint256 y) external pure returns (uint256) {
        return x.pow(y);
    }
}
