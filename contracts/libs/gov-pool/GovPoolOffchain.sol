// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/gov/IGovPool.sol";

import "../utils/TokenBalance.sol";
import "../math/MathHelper.sol";
import "./GovPoolCommission.sol";

import "../../gov/GovPool.sol";

library GovPoolOffchain {
    using MathHelper for uint256;
    using Math for uint256;
    using ECDSA for bytes32;
    using TokenBalance for address;
    using GovPoolCommission for address;

    function saveOffchainResults(
        string calldata resultsHash,
        bytes calldata signature,
        IGovPool.OffChain storage offChain
    ) external {
        bytes32 signHash_ = getSignHash(resultsHash);

        require(!offChain.usedHashes[signHash_], "Gov: already used");
        require(
            signHash_.toEthSignedMessageHash().recover(signature) == offChain.verifier,
            "Gov: invalid signer"
        );

        offChain.resultsHash = resultsHash;
        offChain.usedHashes[signHash_] = true;

        _payCommission();
    }

    function getSignHash(string calldata resultsHash) public view returns (bytes32) {
        return keccak256(abi.encodePacked(resultsHash, block.chainid, address(this)));
    }

    function _payCommission() internal {
        (address settingsAddress, , , ) = GovPool(payable(address(this))).getHelperContracts();

        IGovSettings.ProposalSettings memory internalSettings = IGovSettings(settingsAddress)
            .getInternalSettings();

        internalSettings.rewardToken.payCommission(internalSettings.executionReward);
    }
}
