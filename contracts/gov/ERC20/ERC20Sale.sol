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
        govAddress = params.govAddress;
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
