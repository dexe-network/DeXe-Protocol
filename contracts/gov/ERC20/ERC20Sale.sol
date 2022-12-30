// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";

import "../../interfaces/gov/ERC20/IERC20Sale.sol";

contract ERC20Sale is IERC20Sale, ERC20Capped, ERC20Pausable {
    address public govAddress;

    modifier onlyGov() {
        require(msg.sender == govAddress, "ERC20Sale: not a Gov contract");
        _;
    }

    constructor(
        address _govAddress,
        address _saleAddress,
        ConstructorParams memory params
    ) ERC20(params.name, params.symbol) ERC20Capped(params.cap) {
        require(_govAddress != address(0), "ERC20Sale: govAddress is zero");
        require(
            params.mintedTotal <= params.cap,
            "ERC20Sale: mintedTotal should not be greater than cap"
        );
        require(
            params.users.length == params.amounts.length,
            "ERC20Sale: users and amounts lengths mismatch"
        );

        govAddress = _govAddress;

        ERC20._mint(_saleAddress, params.saleAmount);

        for (uint256 i = 0; i < params.users.length; i++) {
            ERC20._mint(params.users[i], params.amounts[i]);
        }

        require(totalSupply() <= params.mintedTotal, "ERC20Sale: overminting");

        ERC20._mint(_govAddress, params.mintedTotal - totalSupply());
    }

    function mint(address account, uint256 amount) external override onlyGov {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external override onlyGov {
        _burn(account, amount);
    }

    function pause() public override onlyGov {
        _pause();
    }

    function unpause() public override onlyGov {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Pausable) {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _mint(address account, uint256 amount) internal override(ERC20, ERC20Capped) {
        super._mint(account, amount);
    }
}
