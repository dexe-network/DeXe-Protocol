// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../interfaces/trader/IInvestTraderPool.sol";

import "./RiskyTraderPool.sol";

contract InvestTraderPool is IInvestTraderPool, RiskyTraderPool {}
