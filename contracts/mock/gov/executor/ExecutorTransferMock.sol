// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

contract ExecutorTransferMock is ERC721Holder, ERC1155Holder {
    address public govAddress;
    address public mock20Address;
    address public mock721Address;
    address public mock1155Address;

    uint256 public amount20;
    uint256[] public ids721;
    uint256[] public ids1155;
    uint256[] public amounts1155;

    bool public isShouldRevert;

    constructor(
        address _govAddress,
        address _mock20Address,
        address _mock721Address,
        address _mock1155Address
    ) {
        govAddress = _govAddress;
        mock20Address = _mock20Address;
        mock721Address = _mock721Address;
        mock1155Address = _mock1155Address;
    }

    function setTransferAmount(
        uint256 _amount20,
        uint256[] calldata _ids1155,
        uint256[] calldata _amounts1155,
        uint256[] calldata _ids721
    ) external {
        ids721 = _ids721;
        amount20 = _amount20;
        ids1155 = _ids1155;
        amounts1155 = _amounts1155;
    }

    function changeRevert() external {
        isShouldRevert = !isShouldRevert;
    }

    function execute() external {
        require(!isShouldRevert, "Revert message");

        address _govAddress = govAddress;

        if (amount20 > 0) {
            IERC20(mock20Address).transferFrom(_govAddress, address(this), amount20);
        }

        address _mock721Address = mock721Address;
        uint256 length721 = ids721.length;
        for (uint256 i; i < length721; i++) {
            IERC721(_mock721Address).safeTransferFrom(_govAddress, address(this), ids721[i]);
        }

        if (amounts1155.length > 0) {
            address _mock1155Address = mock1155Address;
            uint256 length1155 = amounts1155.length;
            for (uint256 i; i < length1155; i++) {
                IERC1155(_mock1155Address).safeTransferFrom(
                    _govAddress,
                    address(this),
                    ids1155[i],
                    amounts1155[i],
                    ""
                );
            }
        }
    }
}
