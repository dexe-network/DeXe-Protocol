// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/gov/ERC20/IERC20Sale.sol";

contract ERC20Sale is
    IERC20Sale,
    ERC20CappedUpgradeable,
    ERC20PausableUpgradeable,
    ERC20BurnableUpgradeable
{
    using EnumerableSet for EnumerableSet.AddressSet;
    address public govAddress;

    EnumerableSet.AddressSet internal _blacklistTokens;

    modifier onlyGov() {
        _onlyGov();
        _;
    }

    function __ERC20Sale_init(
        address _govAddress,
        address _saleAddress,
        ConstructorParams calldata params
    ) external initializer {
        __ERC20_init(params.name, params.symbol);
        __ERC20Capped_init(params.cap);

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

        ERC20Upgradeable._mint(_saleAddress, params.saleAmount);

        for (uint256 i = 0; i < params.users.length; i++) {
            ERC20Upgradeable._mint(params.users[i], params.amounts[i]);
        }

        require(totalSupply() <= params.mintedTotal, "ERC20Sale: overminting");

        ERC20Upgradeable._mint(_govAddress, params.mintedTotal - totalSupply());
    }

    function mint(address account, uint256 amount) external override onlyGov {
        _mint(account, amount);
    }

    function pause() external override onlyGov {
        _pause();
    }

    function unpause() external override onlyGov {
        _unpause();
    }

    function blacklist(address account, bool value) external override onlyGov {
        if (value) {
            require(_blacklistTokens.add(account), "ERC20Sale: already blacklisted");
        } else {
            require(_blacklistTokens.remove(account), "ERC20Sale: not blacklisted");
        }
    }

    function getBlacklistTokens() external view override returns (address[] memory) {
        return _blacklistTokens.values();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        require(!_blacklistTokens.contains(from), "ERC20Sale: account is blacklisted");

        super._beforeTokenTransfer(from, to, amount);
    }

    function _mint(
        address account,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20CappedUpgradeable) {
        super._mint(account, amount);
    }

    function _onlyGov() internal view {
        require(msg.sender == govAddress, "ERC20Sale: not a Gov contract");
    }
}
