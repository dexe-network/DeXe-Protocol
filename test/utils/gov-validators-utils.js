const getBytesChangeInternalBalances = (amounts, users) => {
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
    [amounts, users],
  );
};

const getBytesChangeValidatorSettings = ([duration, executionDelay, quorum]) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "changeSettings",
      type: "function",
      inputs: [
        {
          name: "duration",
          type: "uint64",
        },
        {
          name: "executionDelay",
          type: "uint64",
        },
        {
          name: "quorum",
          type: "uint128",
        },
      ],
    },
    [duration, executionDelay, quorum],
  );
};

const getBytesMonthlyWithdraw = (tokens, amounts, destination) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "monthlyWithdraw",
      type: "function",
      inputs: [
        {
          name: "tokens",
          type: "address[]",
        },
        {
          name: "amounts",
          type: "uint256[]",
        },
        {
          name: "destination",
          type: "address",
        },
      ],
    },
    [tokens, amounts, destination],
  );
};

module.exports = {
  getBytesChangeInternalBalances,
  getBytesChangeValidatorSettings,
  getBytesMonthlyWithdraw,
};
