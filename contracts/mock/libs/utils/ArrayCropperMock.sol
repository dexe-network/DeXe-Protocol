// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../../libs/utils/ArrayCropper.sol";

contract ArrayCropperMock {
    using ArrayCropper for *;

    function cropUint(
        uint256[] calldata arr,
        uint256 newLength
    ) external pure returns (uint256[] memory) {
        return arr.crop(newLength);
    }

    function cropAddress(
        address[] calldata arr,
        uint256 newLength
    ) external pure returns (address[] memory) {
        return arr.crop(newLength);
    }
}
