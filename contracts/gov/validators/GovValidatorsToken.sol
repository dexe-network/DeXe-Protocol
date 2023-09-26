// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";

import "../../interfaces/gov/validators/IGovValidatorsToken.sol";

contract GovValidatorsToken is IGovValidatorsToken, ERC20Snapshot {
    address public immutable validator;

    modifier onlyValidator() {
        _onlyValidator();
        _;
    }

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        validator = msg.sender;
    }

    function mint(address account, uint256 amount) external override {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external override {
        _burn(account, amount);
    }

    function snapshot() external override onlyValidator returns (uint256) {
        return _snapshot();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override onlyValidator {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _onlyValidator() internal view {
        require(validator == msg.sender, "ValidatorsToken: caller is not the validator");
    }
}
