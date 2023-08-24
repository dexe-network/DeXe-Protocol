const getBytesLinearPowerInit = () => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "__LinearPower_init",
      type: "function",
      inputs: [],
    },
    []
  );
};

const getBytesRootPowerInit = (regularVoteModifier, expertVoteModifier) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "__RootPower_init",
      type: "function",
      inputs: [
        {
          type: "uint256",
          name: "regularVoteModifier",
        },
        {
          type: "uint256",
          name: "expertVoteModifier",
        },
      ],
    },
    [regularVoteModifier, expertVoteModifier]
  );
};

module.exports = {
  getBytesLinearPowerInit,
  getBytesRootPowerInit,
};
