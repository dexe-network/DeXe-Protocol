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

module.exports = {
  getBytesLinearPowerInit,
};
