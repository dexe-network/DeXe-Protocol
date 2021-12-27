// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../core/ICoreProperties.sol";

/**
 * This is the Factory contract for the trader pools. Anyone can create a pool for themselves to become a trader.
 * There are 2 pools available: BasicTraderPool and InvestTraderPool. The latter is much more risky than the former
 */
interface ITraderPoolFactory {
    /// @notice The parameters the trader can specify on the pool's creation
    /// @param descriptionURL the IPFS URL of the pool description
    /// @param trader the trader of the pool
    /// @param privatePool the publicity of the pool
    /// @param totalLPEmission maximal* emmission of LP tokens that can be invested
    /// @param baseToken the address of the base token of the pool
    /// @param minimalInvestment the minimal allowed investment into the pool
    /// @param commissionPeriod the duration of the commission period
    /// @param commissionPercentage trader's commission percentage (including DEXE commission)
    struct PoolDeployParameters {
        string descriptionURL;
        address trader;
        bool privatePool;
        uint256 totalLPEmission; // zero means unlimited
        address baseToken;
        uint256 minimalInvestment; // zero means any value
        ICoreProperties.CommissionPeriod commissionPeriod;
        uint256 commissionPercentage;
    }

    /// @notice The function to deploy basic pools
    /// @param name the ERC20 name of the pool
    /// @param symbol the ERC20 symbol of the pool
    /// @param poolDeployParameters the parameters of the pool
    function deployBasicPool(
        string calldata name,
        string calldata symbol,
        PoolDeployParameters calldata poolDeployParameters
    ) external;

    /// @notice The function to deploy invest pools
    /// @param name the ERC20 name of the pool
    /// @param symbol the ERC20 symbol of the pool
    /// @param poolDeployParameters the parameters of the pool
    function deployInvestPool(
        string calldata name,
        string calldata symbol,
        PoolDeployParameters calldata poolDeployParameters
    ) external;
}
