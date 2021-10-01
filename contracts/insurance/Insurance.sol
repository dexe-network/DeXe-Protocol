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
    mapping(string => address) public urlUser;

    uint256 public totalPool;

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
        require(urlUser[url] == address(0), "Insurance: Url is not unique");
        urlUser[url] = _msgSender();
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
        uint256 maxPayPool = totalPool;
        uint256 totalToPay;
        for (uint256 i; i < amounts.length; i++) {
            totalToPay += amounts[i];
        }
        if (totalToPay >= maxPayPool / 3) {
            for (uint256 i; i < amounts.length; i++) {
                _dexe.transfer(
                    users[i],
                    (amounts[i] * getProportionalPart(amounts[i], totalToPay)) /
                        10**_dexe.decimals()
                );
            }
        }
    }

    function getProportionalPart(uint256 amount, uint256 total) internal view returns (uint256) {
        return (amount * 10**_dexe.decimals()) / total;
    }
}
