// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    uint8 internal _decimals;
    bool internal _allowMint;
    uint256 internal _blacklistOption;
    mapping(address => bool) internal _isBlacklisted;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimalPlaces
    ) ERC20(name, symbol) {
        _decimals = decimalPlaces;
        _allowMint = true;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 _amount) external virtual {
        require(_allowMint, "ERC20Mock: minting is off");

        _mint(to, _amount);
    }

    function burn(address from, uint256 _amount) external {
        _burn(from, _amount);
    }

    function toggleMint() external {
        _allowMint = !_allowMint;
    }

    function setDecimals(uint8 decimals_) external {
        _decimals = decimals_;
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 wad) public {
        require(balanceOf(msg.sender) >= wad, "");
        _burn(msg.sender, wad);
        payable(msg.sender).transfer(wad);
    }

    function blacklist(address user, bool state) external {
        _isBlacklisted[user] = state;
    }

    function setBlacklistOption(uint256 opt) external {
        _blacklistOption = opt;
    }

    function isBlacklisted(address user) external view returns (bool) {
        if (_blacklistOption == 0) {
            // disabled
            return false;
        } else if (_blacklistOption == 1) {
            // regular case
            return _isBlacklisted[user];
        } else if (_blacklistOption == 2) {
            // silent revert
            revert();
        } else if (_blacklistOption == 3) {
            // regular revert
            revert("No such function");
        } else {
            // hard revert
            address(this).staticcall(abi.encodeWithSelector(this.setDecimals.selector, 20));
        }
    }
}
