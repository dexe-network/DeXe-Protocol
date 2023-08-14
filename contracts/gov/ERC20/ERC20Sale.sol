// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@solarity/solidity-lib/libs/arrays/Paginator.sol";
import "@solarity/solidity-lib/libs/arrays/SetHelper.sol";

import "../../interfaces/gov/ERC20/IERC20Sale.sol";

contract ERC20Sale is
    IERC20Sale,
    ERC20CappedUpgradeable,
    ERC20PausableUpgradeable,
    ERC20BurnableUpgradeable
{
    using EnumerableSet for EnumerableSet.AddressSet;
    using Paginator for EnumerableSet.AddressSet;
    using SetHelper for EnumerableSet.AddressSet;

    address public govAddress;

    EnumerableSet.AddressSet internal _blacklistAccounts;

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

    function blacklist(
        address[] calldata accounts,
        bool value
    ) external override whenNotPaused onlyGov {
        if (value) {
            _blacklistAccounts.add(accounts);
        } else {
            _blacklistAccounts.remove(accounts);
        }
    }

    function totalBlacklistAccounts() external view override returns (uint256) {
        return _blacklistAccounts.length();
    }

    function getBlacklistAccounts(
        uint256 offset,
        uint256 limit
    ) external view override returns (address[] memory) {
        return _blacklistAccounts.part(offset, limit);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        require(
            !_blacklistAccounts.contains(from) && !_blacklistAccounts.contains(to),
            "ERC20Sale: account is blacklisted"
        );

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
