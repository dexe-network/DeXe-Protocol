// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../libs/utils/DataHelper.sol";

contract ReentrantCallerMock {
    using DataHelper for bytes;

    address public callbackAddress;
    bytes public callbackData;

    fallback() external payable {
        (bool ok, bytes memory data) = callbackAddress.call(callbackData);
        require(ok, data.getRevertMsg());
    }

    function setCallback(address _callbackAddress, bytes calldata _callbackData) external {
        callbackAddress = _callbackAddress;
        callbackData = _callbackData;
    }

    function getBytecode() external view returns (bytes memory) {
        return address(this).code;
    }
}
