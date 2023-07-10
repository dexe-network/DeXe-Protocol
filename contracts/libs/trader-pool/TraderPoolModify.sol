// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../../interfaces/trader/ITraderPool.sol";

import "../../trader/TraderPool.sol";

library TraderPoolModify {
    using EnumerableSet for EnumerableSet.AddressSet;

    event ModifiedAdmins(address sender, address[] admins, bool add);
    event ModifiedPrivateInvestors(address sender, address[] privateInvestors, bool add);
    event DescriptionURLChanged(address sender, string descriptionURL);

    function modifyAdmins(
        EnumerableSet.AddressSet storage admins,
        ITraderPool.PoolParameters storage poolParameters,
        address[] calldata newAdmins,
        bool add
    ) external {
        for (uint256 i = 0; i < newAdmins.length; i++) {
            if (add) {
                admins.add(newAdmins[i]);
            } else {
                admins.remove(newAdmins[i]);
            }
        }

        admins.add(poolParameters.trader);

        emit ModifiedAdmins(msg.sender, newAdmins, add);
    }

    function modifyPrivateInvestors(
        EnumerableSet.AddressSet storage privateInvestors,
        address[] calldata newPrivateInvestors,
        bool add
    ) external {
        TraderPool traderPool = TraderPool(address(this));

        for (uint256 i = 0; i < newPrivateInvestors.length; i++) {
            if (add) {
                privateInvestors.add(newPrivateInvestors[i]);
            } else {
                require(
                    traderPool.canRemovePrivateInvestor(newPrivateInvestors[i]),
                    "TP: can't remove investor"
                );

                privateInvestors.remove(newPrivateInvestors[i]);
            }
        }

        emit ModifiedPrivateInvestors(msg.sender, newPrivateInvestors, add);
    }

    function changePoolParameters(
        ITraderPool.PoolParameters storage poolParameters,
        EnumerableSet.AddressSet storage investors,
        string calldata descriptionURL,
        bool onlyBABTHolders,
        bool privatePool,
        uint256 totalLPEmission,
        uint256 minimalInvestment
    ) external {
        require(
            totalLPEmission == 0 || TraderPool(address(this)).totalEmission() <= totalLPEmission,
            "TP: wrong emission supply"
        );
        require(!privatePool || (privatePool && investors.length() == 0), "TP: pool is not empty");

        poolParameters.descriptionURL = descriptionURL;
        poolParameters.onlyBABTHolders = onlyBABTHolders;
        poolParameters.privatePool = privatePool;
        poolParameters.totalLPEmission = totalLPEmission;
        poolParameters.minimalInvestment = minimalInvestment;

        emit DescriptionURLChanged(msg.sender, descriptionURL);
    }
}
