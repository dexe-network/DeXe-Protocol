const getBytesLinearPowerInit = () => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "__LinearPower_init",
      type: "function",
      inputs: [],
    },
    [],
  );
};

const getBytesPolynomialPowerInit = (k1, k2, k3) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "__PolynomialPower_init",
      type: "function",
      inputs: [
        {
          type: "uint256",
          name: "k1",
        },
        {
          type: "uint256",
          name: "k2",
        },
        {
          type: "uint256",
          name: "k3",
        },
      ],
    },
    [k1, k2, k3],
  );
};

module.exports = {
  getBytesLinearPowerInit,
  getBytesPolynomialPowerInit,
};
