// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library AddressSetHelper {
    using EnumerableSet for EnumerableSet.AddressSet;

    function add(EnumerableSet.AddressSet storage addressSet, address[] calldata array) internal {
        for (uint256 i = 0; i < array.length; i++) {
            addressSet.add(array[i]);
        }
    }

    function remove(
        EnumerableSet.AddressSet storage addressSet,
        address[] calldata array
    ) internal {
        for (uint256 i = 0; i < array.length; i++) {
            addressSet.remove(array[i]);
        }
    }
}
