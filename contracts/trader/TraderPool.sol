// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../interfaces/trader/ITraderPool.sol";
import "../interfaces/core/IContractsRegistry.sol";

import "../helpers/AbstractDependant.sol";

abstract contract TraderPool is
    ITraderPool,
    AccessControlUpgradeable,
    ERC20Upgradeable,
    AbstractDependant
{
    using EnumerableSet for EnumerableSet.AddressSet;

    bytes32 public constant TRADER_ROLE = keccak256("TRADER_ROLE");

    IERC20 internal _dexeToken;

    PoolParameters public poolParameters;
    EnumerableSet.AddressSet internal _privateInvestors;

    modifier onlyTrader() {
        require(isTrader(_msgSender()), "TraderPool: msg.sender is not a trader");
        _;
    }

    function isTrader(address who) public view returns (bool) {
        return hasRole(TRADER_ROLE, who);
    }

    function __TraderPool_init(
        string memory name,
        string memory symbol,
        string memory description,
        bool activePortfolio,
        bool privatePool,
        uint256 totalLPEmission,
        address baseToken,
        uint256 minimalInvestment,
        CommissionPeriod commissionPeriod,
        uint256 commissionPercentage
    ) public {
        __AccessControl_init();
        __ERC20_init(name, symbol);

        poolParameters = PoolParameters(
            description,
            activePortfolio,
            privatePool,
            totalLPEmission,
            baseToken,
            minimalInvestment,
            commissionPeriod,
            commissionPercentage
        );

        _setupRole(TRADER_ROLE, _msgSender());
        _setRoleAdmin(TRADER_ROLE, TRADER_ROLE);
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        public
        virtual
        override
        onlyInjectorOrZero
    {
        _dexeToken = IERC20(contractsRegistry.getDEXEContract());
    }

    function _investPassivePortfolio() internal {}

    function _investActivePortfolio() internal {}

    function invest(uint256 amountInBase) external virtual {
        require(
            !poolParameters.privatePool ||
                isTrader(_msgSender()) ||
                _privateInvestors.contains(_msgSender()),
            "TraderPool: msg.sender is not allowed to invest"
        );
        require(amountInBase >= poolParameters.minimalInvestment, "TraderPool: underinvestment");

        if (poolParameters.activePortfolio) {
            _investActivePortfolio();
        } else {
            _investPassivePortfolio();
        }
    }
}
