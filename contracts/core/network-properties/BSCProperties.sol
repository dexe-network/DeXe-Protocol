// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@solarity/solidity-lib/access-control/MultiOwnable.sol";

import "@uniswap/v2-periphery/contracts/interfaces/IWETH.sol";

import "../../interfaces/core/INetworkProperties.sol";

contract BSCProperties is INetworkProperties, MultiOwnable, UUPSUpgradeable {
    uint256 private constant BNB_SUPPLY = 150_000_000 * 10 ** 18;

    IWETH public weth;

    function __NetworkProperties_init(address weth_) external initializer {
        __MultiOwnable_init();

        weth = IWETH(weth_);
    }

    function unwrapWeth(uint256 amount) external override {
        weth.withdraw(amount);

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        assert(ok);
    }

    receive() external payable {}

    function getNativeSupply() external view override returns (uint256) {
        return BNB_SUPPLY;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
