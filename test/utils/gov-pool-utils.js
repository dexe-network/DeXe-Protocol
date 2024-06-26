const getBytesExecute = () => {
  return web3.eth.abi.encodeFunctionSignature("execute()");
};

const getBytesApprove = (address, amount) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "approve",
      type: "function",
      inputs: [
        {
          type: "address",
          name: "spender",
        },
        {
          type: "uint256",
          name: "amount",
        },
      ],
    },
    [address, amount],
  );
};

const getBytesApproveAll = (address, action) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "setApprovalForAll",
      type: "function",
      inputs: [
        {
          type: "address",
          name: "operator",
        },
        {
          type: "bool",
          name: "approved",
        },
      ],
    },
    [address, action],
  );
};

const getBytesTransfer = (address, amount) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "transfer",
      type: "function",
      inputs: [
        {
          type: "address",
          name: "to",
        },
        {
          type: "uint256",
          name: "amount",
        },
      ],
    },
    [address, amount],
  );
};

const getBytesChangeVotePower = (votePower) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "address",
          name: "votePower",
          type: "address",
        },
      ],
      name: "changeVotePower",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [votePower],
  );
};

const getBytesEditUrl = (url) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "editDescriptionURL",
      type: "function",
      inputs: [
        {
          name: "newDescriptionURL",
          type: "string",
        },
      ],
    },
    [url],
  );
};

const getBytesSetNftMultiplierAddress = (addr) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "setNftMultiplierAddress",
      type: "function",
      inputs: [
        {
          name: "nftMultiplierAddress",
          type: "address",
        },
      ],
    },
    [addr],
  );
};

const getBytesDistributionProposal = (proposalId, token, amount) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256",
          name: "proposalId",
          type: "uint256",
        },
        {
          internalType: "address",
          name: "token",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
      ],
      name: "execute",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [proposalId, token, amount],
  );
};

const getBytesChangeBalances = (newValues, addresses) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "changeBalances",
      type: "function",
      inputs: [
        {
          name: "newValues",
          type: "uint256[]",
        },
        {
          name: "userAddresses",
          type: "address[]",
        },
      ],
    },
    [newValues, addresses],
  );
};

const getBytesSetERC20Address = (address) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "setERC20Address",
      type: "function",
      inputs: [
        {
          name: "_tokenAddress",
          type: "address",
        },
      ],
    },
    [address],
  );
};

const getBytesSetERC721Address = (address, individualPower, nftsTotalSupply) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "setERC721Address",
      type: "function",
      inputs: [
        {
          name: "_nftAddress",
          type: "address",
        },
        {
          name: "individualPower",
          type: "uint256",
        },
        {
          name: "nftsTotalSupply",
          type: "uint256",
        },
      ],
    },
    [address, individualPower, nftsTotalSupply],
  );
};

const getBytesAddSettings = (settings) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "addSettings",
      type: "function",
      inputs: [
        {
          components: [
            {
              type: "bool",
              name: "earlyCompletion",
            },
            {
              type: "bool",
              name: "delegatedVotingAllowed",
            },
            {
              type: "bool",
              name: "validatorsVote",
            },
            {
              type: "uint64",
              name: "duration",
            },
            {
              type: "uint64",
              name: "durationValidators",
            },
            {
              type: "uint64",
              name: "executionDelay",
            },
            {
              type: "uint128",
              name: "quorum",
            },
            {
              type: "uint128",
              name: "quorumValidators",
            },
            {
              type: "uint256",
              name: "minVotesForVoting",
            },
            {
              type: "uint256",
              name: "minVotesForCreating",
            },
            {
              components: [
                {
                  name: "rewardToken",
                  type: "address",
                },
                {
                  name: "creationReward",
                  type: "uint256",
                },
                {
                  name: "executionReward",
                  type: "uint256",
                },
                {
                  name: "voteRewardsCoefficient",
                  type: "uint256",
                },
              ],
              name: "rewardsInfo",
              type: "tuple",
            },
            {
              type: "string",
              name: "executorDescription",
            },
          ],
          type: "tuple[]",
          name: "_settings",
        },
      ],
    },
    [settings],
  );
};

const getBytesEditSettings = (ids, settings) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "editSettings",
      type: "function",
      inputs: [
        {
          type: "uint256[]",
          name: "settingsIds",
        },
        {
          components: [
            {
              type: "bool",
              name: "earlyCompletion",
            },
            {
              type: "bool",
              name: "delegatedVotingAllowed",
            },
            {
              type: "bool",
              name: "validatorsVote",
            },
            {
              type: "uint64",
              name: "duration",
            },
            {
              type: "uint64",
              name: "durationValidators",
            },

            {
              type: "uint64",
              name: "executionDelay",
            },
            {
              type: "uint128",
              name: "quorum",
            },
            {
              type: "uint128",
              name: "quorumValidators",
            },
            {
              type: "uint256",
              name: "minVotesForVoting",
            },
            {
              type: "uint256",
              name: "minVotesForCreating",
            },
            {
              components: [
                {
                  name: "rewardToken",
                  type: "address",
                },
                {
                  name: "creationReward",
                  type: "uint256",
                },
                {
                  name: "executionReward",
                  type: "uint256",
                },
                {
                  name: "voteRewardsCoefficient",
                  type: "uint256",
                },
              ],
              name: "rewardsInfo",
              type: "tuple",
            },
            {
              type: "string",
              name: "executorDescription",
            },
          ],
          type: "tuple[]",
          name: "_settings",
        },
      ],
    },
    [ids, settings],
  );
};

const getBytesChangeExecutors = (executors, ids) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "changeExecutors",
      type: "function",
      inputs: [
        {
          type: "address[]",
          name: "executors",
        },
        {
          type: "uint256[]",
          name: "settingsIds",
        },
      ],
    },
    [executors, ids],
  );
};

const getBytesCreateTiersTSP = (tiers) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          components: [
            {
              components: [
                {
                  internalType: "string",
                  name: "name",
                  type: "string",
                },
                {
                  internalType: "string",
                  name: "description",
                  type: "string",
                },
              ],
              internalType: "struct ITokenSaleProposal.TierMetadata",
              name: "metadata",
              type: "tuple",
            },
            {
              internalType: "uint256",
              name: "totalTokenProvided",
              type: "uint256",
            },
            {
              internalType: "uint64",
              name: "saleStartTime",
              type: "uint64",
            },
            {
              internalType: "uint64",
              name: "saleEndTime",
              type: "uint64",
            },
            {
              internalType: "uint64",
              name: "claimLockDuration",
              type: "uint64",
            },
            {
              internalType: "address",
              name: "saleTokenAddress",
              type: "address",
            },
            {
              internalType: "address[]",
              name: "purchaseTokenAddresses",
              type: "address[]",
            },
            {
              internalType: "uint256[]",
              name: "exchangeRates",
              type: "uint256[]",
            },
            {
              internalType: "uint256",
              name: "minAllocationPerUser",
              type: "uint256",
            },
            {
              internalType: "uint256",
              name: "maxAllocationPerUser",
              type: "uint256",
            },
            {
              components: [
                {
                  internalType: "uint256",
                  name: "vestingPercentage",
                  type: "uint256",
                },
                {
                  internalType: "uint64",
                  name: "vestingDuration",
                  type: "uint64",
                },
                {
                  internalType: "uint64",
                  name: "cliffPeriod",
                  type: "uint64",
                },
                {
                  internalType: "uint64",
                  name: "unlockStep",
                  type: "uint64",
                },
              ],
              internalType: "struct ITokenSaleProposal.VestingSettings",
              name: "vestingSettings",
              type: "tuple",
            },
            {
              components: [
                {
                  internalType: "enum ITokenSaleProposal.ParticipationType",
                  name: "participationType",
                  type: "uint8",
                },
                {
                  internalType: "bytes",
                  name: "data",
                  type: "bytes",
                },
              ],
              internalType: "struct ITokenSaleProposal.ParticipationDetails[]",
              name: "participationDetails",
              type: "tuple[]",
            },
          ],
          internalType: "struct ITokenSaleProposal.TierInitParams[]",
          name: "tierInitParams",
          type: "tuple[]",
        },
      ],
      name: "createTiers",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [tiers],
  );
};

const getBytesChangeParticipationDetailsTSP = (tierId, newSettings) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256",
          name: "tierId",
          type: "uint256",
        },
        {
          components: [
            {
              internalType: "enum ITokenSaleProposal.ParticipationType",
              name: "participationType",
              type: "uint8",
            },
            {
              internalType: "bytes",
              name: "data",
              type: "bytes",
            },
          ],
          internalType: "struct ITokenSaleProposal.ParticipationDetails[]",
          name: "newSettings",
          type: "tuple[]",
        },
      ],
      name: "changeParticipationDetails",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [tierId, newSettings],
  );
};

const getBytesAddToWhitelistTSP = (requests) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          components: [
            {
              internalType: "uint256",
              name: "tierId",
              type: "uint256",
            },
            {
              internalType: "address[]",
              name: "users",
              type: "address[]",
            },
            {
              internalType: "string",
              name: "uri",
              type: "string",
            },
          ],
          internalType: "struct ITokenSaleProposal.WhitelistingRequest[]",
          name: "requests",
          type: "tuple[]",
        },
      ],
      name: "addToWhitelist",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [requests],
  );
};

const getBytesOffTiersTSP = (tierIds) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256[]",
          name: "tierIds",
          type: "uint256[]",
        },
      ],
      name: "offTiers",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [tierIds],
  );
};

const getBytesRecoverTSP = (tierIds) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256[]",
          name: "tierIds",
          type: "uint256[]",
        },
      ],
      name: "recover",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [tierIds],
  );
};

const getBytesBuyTSP = (tierId, tokenToBuyWith, amount, proof) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256",
          name: "tierId",
          type: "uint256",
        },
        {
          internalType: "address",
          name: "tokenToBuyWith",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
        {
          internalType: "bytes32[]",
          name: "proof",
          type: "bytes32[]",
        },
      ],
      name: "buy",
      outputs: [],
      stateMutability: "payable",
      type: "function",
    },
    [tierId, tokenToBuyWith, amount, proof],
  );
};

const getBytesLockParticipationTokensTSP = (tierId, tokenToLock, amountToLock) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256",
          name: "tierId",
          type: "uint256",
        },
        {
          internalType: "address",
          name: "tokenToLock",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "amountToLock",
          type: "uint256",
        },
      ],
      name: "lockParticipationTokens",
      outputs: [],
      stateMutability: "payable",
      type: "function",
    },
    [tierId, tokenToLock, amountToLock],
  );
};

const getBytesLockParticipationNftTSP = (tierId, nftToLock, nftIdsToLock) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256",
          name: "tierId",
          type: "uint256",
        },
        {
          internalType: "address",
          name: "nftToLock",
          type: "address",
        },
        {
          internalType: "uint256[]",
          name: "nftIdsToLock",
          type: "uint256[]",
        },
      ],
      name: "lockParticipationNft",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [tierId, nftToLock, nftIdsToLock],
  );
};

const getBytesChangeVerifier = (newAddress) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "address",
          name: "newVerifier",
          type: "address",
        },
      ],
      name: "changeVerifier",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [newAddress],
  );
};

const getBytesChangeBABTRestriction = (restrict) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint8",
          name: "onlyBABT",
          type: "bool",
        },
      ],
      name: "changeBABTRestriction",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [restrict],
  );
};

const getBytesGovExecute = (proposalId) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256",
          name: "proposalId",
          type: "uint256",
        },
      ],
      name: "execute",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [proposalId],
  );
};

const getBytesGovClaimRewards = (proposalIds, user) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256[]",
          name: "proposalIds",
          type: "uint256[]",
        },
        {
          internalType: "address",
          name: "user",
          type: "address",
        },
      ],
      name: "claimRewards",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [proposalIds, user],
  );
};

const getBytesGovVote = (proposalId, voteAmount, voteNftIds, isVoteFor = true) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256",
          name: "proposalId",
          type: "uint256",
        },
        {
          internalType: "bool",
          name: "isVoteFor",
          type: "bool",
        },
        {
          internalType: "uint256",
          name: "voteAmount",
          type: "uint256",
        },
        {
          internalType: "uint256[]",
          name: "voteNftIds",
          type: "uint256[]",
        },
      ],
      name: "vote",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [proposalId, isVoteFor, voteAmount, voteNftIds],
  );
};

const getBytesGovDeposit = (amount, nftIds) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
        {
          internalType: "uint256[]",
          name: "nftIds",
          type: "uint256[]",
        },
      ],
      name: "deposit",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [amount, nftIds],
  );
};

const getBytesGovWithdraw = (receiver, amount, nftIds) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "address",
          name: "receiver",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
        {
          internalType: "uint256[]",
          name: "nftIds",
          type: "uint256[]",
        },
      ],
      name: "withdraw",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [receiver, amount, nftIds],
  );
};

const getBytesGovDelegate = (delegatee, amount, nftIds) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "address",
          name: "delegatee",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
        {
          internalType: "uint256[]",
          name: "nftIds",
          type: "uint256[]",
        },
      ],
      name: "delegate",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [delegatee, amount, nftIds],
  );
};

const getBytesGovUndelegate = (delegatee, amount, nftIds) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "address",
          name: "delegatee",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
        {
          internalType: "uint256[]",
          name: "nftIds",
          type: "uint256[]",
        },
      ],
      name: "undelegate",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [delegatee, amount, nftIds],
  );
};

const getBytesKeeperWithdrawTokens = (payer, receiver, amount) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "address",
          name: "payer",
          type: "address",
        },
        {
          internalType: "address",
          name: "receiver",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
      ],
      name: "withdrawTokens",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [payer, receiver, amount],
  );
};

const getBytesSetCreditInfo = (tokens, amounts) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "address[]",
          name: "tokens",
          type: "address[]",
        },
        {
          internalType: "uint256[]",
          name: "amounts",
          type: "uint256[]",
        },
      ],
      name: "setCreditInfo",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [tokens, amounts],
  );
};

const getBytesChangeVoteModifiers = (regularModifier, expertModifier) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "uint256",
          name: "regularModifier",
          type: "uint256",
        },
        {
          internalType: "uint256",
          name: "expertModifier",
          type: "uint256",
        },
      ],
      name: "changeVoteModifiers",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [regularModifier, expertModifier],
  );
};

const getBytesMintExpertNft = (to, uri) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "address",
          name: "to",
          type: "address",
        },
        {
          internalType: "string",
          name: "uri",
          type: "string",
        },
      ],
      name: "mint",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [to, uri],
  );
};

const getBytesBurnExpertNft = (from) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "address",
          name: "from",
          type: "address",
        },
      ],
      name: "burn",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [from],
  );
};

const getBytesDelegateTreasury = (delegatee, amount, nftIds) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "address",
          name: "delegatee",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
        {
          internalType: "uint256[]",
          name: "nftIds",
          type: "uint256[]",
        },
      ],
      name: "delegateTreasury",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [delegatee, amount, nftIds],
  );
};

const getBytesUndelegateTreasury = (delegatee, amount, nftIds) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      inputs: [
        {
          internalType: "address",
          name: "delegatee",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256",
        },
        {
          internalType: "uint256[]",
          name: "nftIds",
          type: "uint256[]",
        },
      ],
      name: "undelegateTreasury",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    [delegatee, amount, nftIds],
  );
};

module.exports = {
  getBytesExecute,
  getBytesApprove,
  getBytesApproveAll,
  getBytesTransfer,
  getBytesChangeVotePower,
  getBytesEditUrl,
  getBytesSetNftMultiplierAddress,
  getBytesDistributionProposal,
  getBytesChangeBalances,
  getBytesSetERC20Address,
  getBytesSetERC721Address,
  getBytesAddSettings,
  getBytesEditSettings,
  getBytesChangeExecutors,
  getBytesCreateTiersTSP,
  getBytesChangeParticipationDetailsTSP,
  getBytesAddToWhitelistTSP,
  getBytesOffTiersTSP,
  getBytesRecoverTSP,
  getBytesBuyTSP,
  getBytesLockParticipationTokensTSP,
  getBytesLockParticipationNftTSP,
  getBytesChangeVerifier,
  getBytesChangeBABTRestriction,
  getBytesGovExecute,
  getBytesGovClaimRewards,
  getBytesGovVote,
  getBytesGovDeposit,
  getBytesGovWithdraw,
  getBytesGovDelegate,
  getBytesGovUndelegate,
  getBytesKeeperWithdrawTokens,
  getBytesSetCreditInfo,
  getBytesChangeVoteModifiers,
  getBytesMintExpertNft,
  getBytesBurnExpertNft,
  getBytesDelegateTreasury,
  getBytesUndelegateTreasury,
};
