// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/user/IUserRegistry.sol";

contract UserRegistry is IUserRegistry, EIP712Upgradeable, OwnableUpgradeable {
    bytes32 public documentHash;

    mapping(address => UserInfo) public userInfos;

    event UpdatedProfile(address user, string url);
    event Agreed(address user, bytes32 documentHash);

    function __UserRegistry_init(string calldata name) public initializer {
        __EIP712_init(name, "1");
        __Ownable_init();
    }

    function changeProfile(string calldata url) public override {
        userInfos[msg.sender].profileURL = url;

        emit UpdatedProfile(msg.sender, url);
    }

    function agreeToPrivacyPolicy(bytes calldata signature) public override {
        require(documentHash != 0, "UserRegistry: privacy policy is not set");

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(keccak256("Agreement(bytes32 documentHash)"), documentHash))
        );

        require(
            ECDSAUpgradeable.recover(digest, signature) == msg.sender,
            "UserRegistry: invalid signature"
        );

        userInfos[msg.sender].signatureHash = keccak256(abi.encodePacked(signature));

        emit Agreed(msg.sender, documentHash);
    }

    function changeProfileAndAgreeToPrivacyPolicy(string calldata url, bytes calldata signature)
        external
        override
    {
        agreeToPrivacyPolicy(signature);
        changeProfile(url);
    }

    function agreed(address user) external view override returns (bool) {
        return userInfos[user].signatureHash != 0;
    }

    function setPrivacyPolicyDocumentHash(bytes32 hash) external override onlyOwner {
        documentHash = hash;
    }
}
