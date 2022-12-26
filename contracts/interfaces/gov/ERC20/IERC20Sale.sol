// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IERC20Sale {
    struct ConstructorParams {
        string name;
        string symbol;
        uint256 cap;
        uint256 mintedTotal;
        uint256 saleAmount;
        uint256[] amounts;
        address[] users;
        address govAddress;
        address saleAddress;
    }

    function mint(address account, uint256 amount) external;

    function burn(address account, uint256 amount) external;

    function pause() external;

    function unpause() external;
}
