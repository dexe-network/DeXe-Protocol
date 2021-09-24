// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/IRiskyTraderPool.sol";

import "./TraderPool.sol";

contract RiskyTraderPool is IRiskyTraderPool, TraderPool {}
