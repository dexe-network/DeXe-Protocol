// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../gov/ERC20/ERC20Sale.sol";

library GovTokenSaleDeployer {
    function deploy(
        address poolProxy,
        address tokenSaleProxy,
        ERC20Sale.ConstructorParams calldata tokenParams
    ) external returns (address) {
        return address(new ERC20Sale(poolProxy, tokenSaleProxy, tokenParams));
    }
}
