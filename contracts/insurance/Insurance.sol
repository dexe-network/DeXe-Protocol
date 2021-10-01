// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/insurance/IInsurance.sol";
import "../interfaces/core/IContractsRegistry.sol";
import "../interfaces/trader/ITraderPoolRegistry.sol";
import "../helpers/AbstractDependant.sol";

contract Insurance is IInsurance, AbstractDependant, OwnableUpgradeable {
    ITraderPoolRegistry internal _traderPoolRegistry;
    ERC20 internal _dexe;

    mapping(address => uint256) public userStakes;

    modifier onlyTraderPool() {
        require(_traderPoolRegistry.isPool(_msgSender()), "Insurance: Not a trader pool");
        _;
    }

    function __Insurance_init() external initializer {
        __Ownable_init();
    }

    function setDependencies(IContractsRegistry contractsRegistry)
        external
        override
        onlyInjectorOrZero
    {
        _traderPoolRegistry = ITraderPoolRegistry(
            contractsRegistry.getTraderPoolRegistryContract()
        );

        _dexe = ERC20(contractsRegistry.getDEXEContract());
    }

    function receiveDexeFromPools() external onlyTraderPool {
        // TODO
    }

    function buyInsurance(uint256 insuranceAmount) external {
        userStakes[_msgSender()] += insuranceAmount;
        _dexe.transferFrom(_msgSender(), address(this), insuranceAmount);
    }

    function withdraw(uint256 amountToWithdraw) external {
        userStakes[_msgSender()] -= amountToWithdraw;
        _dexe.transfer(_msgSender(), amountToWithdraw);
    }

    function claim(string calldata url) external {
        // TODO
    }

    function listOngoingClaims(uint256 offset, uint256 limit)
        external
        view
        returns (string[] memory urls)
    {
        // TODO
    }

    function listFinishedClaims(uint256 offset, uint256 limit)
        external
        view
        returns (
            string[] memory urls,
            address[] memory claimers,
            uint256[] memory amounts
        )
    {
        // TODO
    }

    function batchPayout(
        string calldata url,
        address[] calldata users,
        uint256[] memory amounts
    ) external onlyOwner {
        // TODO
    }
}
