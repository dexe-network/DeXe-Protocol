// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../libs/data-structures/ShrinkableArray.sol";

contract ShrinkableArrayMock {
    using ShrinkableArray for *;

    function transform(uint256[] calldata arr)
        external
        pure
        returns (ShrinkableArray.UintArray memory)
    {
        return arr.transform();
    }

    function create(uint256 length) external pure returns (ShrinkableArray.UintArray memory) {
        return length.create();
    }

    function crop(ShrinkableArray.UintArray calldata arr, uint256 newLength)
        external
        pure
        returns (ShrinkableArray.UintArray memory)
    {
        return arr.crop(newLength);
    }
}
