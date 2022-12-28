// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../gov/ERC20/ERC20Sale.sol";

library GovTokenSaleDeployer {
    event DaoTokenSaleDeployed(address govPool, address tokenSale, address token);

    function deploy(
        address poolProxy,
        address tokenSaleProxy,
        ERC20Sale.ConstructorParams calldata tokenParams
    ) external returns (address token) {
        token = address(new ERC20Sale(poolProxy, tokenSaleProxy, tokenParams));

        emit DaoTokenSaleDeployed(poolProxy, tokenSaleProxy, token);
    }
}
