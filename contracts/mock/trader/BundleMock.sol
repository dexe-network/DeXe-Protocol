// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../interfaces/trader/ITraderPool.sol";

contract BundleMock {
    function investDivest(
        ITraderPool pool,
        IERC20 token,
        uint256 amount
    ) external {
        token.approve(address(pool), amount);

        pool.invest(amount, new uint256[](0));
        pool.divest(amount, new uint256[](0), 0);
    }
}
