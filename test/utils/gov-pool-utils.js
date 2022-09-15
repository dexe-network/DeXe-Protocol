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
    [address, amount]
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
    [address, action]
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
    [address, amount]
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
    [url]
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
    [proposalId, token, amount]
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
    [newValues, addresses]
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
    [address]
  );
};

const getBytesSetERC721Address = (address, totalPowerInTokens, nftsTotalSupply) => {
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
          name: "totalPowerInTokens",
          type: "uint256",
        },
        {
          name: "nftsTotalSupply",
          type: "uint256",
        },
      ],
    },
    [address, totalPowerInTokens, nftsTotalSupply]
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
              type: "address",
              name: "rewardToken",
            },
            {
              type: "uint256",
              name: "creationReward",
            },
            {
              type: "uint256",
              name: "executionReward",
            },
            {
              type: "uint256",
              name: "voteRewardsCoefficient",
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
    [settings]
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
              type: "address",
              name: "rewardToken",
            },
            {
              type: "uint256",
              name: "creationReward",
            },
            {
              type: "uint256",
              name: "executionReward",
            },
            {
              type: "uint256",
              name: "voteRewardsCoefficient",
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
    [ids, settings]
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
    [executors, ids]
  );
};

module.exports = {
  getBytesExecute,
  getBytesApprove,
  getBytesApproveAll,
  getBytesTransfer,
  getBytesEditUrl,
  getBytesDistributionProposal,
  getBytesChangeBalances,
  getBytesSetERC20Address,
  getBytesSetERC721Address,
  getBytesAddSettings,
  getBytesEditSettings,
  getBytesChangeExecutors,
};
