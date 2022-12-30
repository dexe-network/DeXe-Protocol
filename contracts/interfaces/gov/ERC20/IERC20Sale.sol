// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IERC20Sale {
    struct ConstructorParams {
        string name;
        string symbol;
        address[] users;
        uint256 saleAmount;
        uint256 cap;
        uint256 mintedTotal;
        uint256[] amounts;
    }

    function mint(address account, uint256 amount) external;

    function burn(address account, uint256 amount) external;

    function pause() external;

    function unpause() external;
}
