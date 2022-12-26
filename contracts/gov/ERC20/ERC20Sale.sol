// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../interfaces/gov/ERC20/IERC20Sale.sol";

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";

contract ERC20Sale is IERC20Sale, ERC20Capped, ERC20Pausable {
    address public govAddress;

    modifier onlyGov() {
        require(msg.sender == govAddress, "ERC20Sale: not a Gov contract");
        _;
    }

    constructor(
        ConstructorParams memory params
    ) ERC20(params.name, params.symbol) ERC20Capped(params.cap) {
        require(params.govAddress != address(0), "ERC20Sale: govAddress is zero");
        require(
            params.mintedTotal <= params.cap,
            "ERC20Sale: mintedTotal should be less than cap"
        );

        govAddress = params.govAddress;

        _mint(params.saleAddress, params.saleAmount);

        require(
            params.users.length == params.amounts.length,
            "ERC20Sale: user and amount lengths mismatch"
        );

        for (uint256 i = 0; i < params.users.length; i++) {
            _mint(params.users[i], params.amounts[i]);
        }

        _mint(params.govAddress, params.mintedTotal - totalSupply());
    }

    function mint(address account, uint256 amount) public override onlyGov {
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
