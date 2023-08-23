// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../IGovPool.sol";

interface IProposalValidator {
    function validate(
        IGovPool.ProposalAction[] calldata actions
    ) external view returns (bool valid);
}
