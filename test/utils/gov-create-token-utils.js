const getBytesERC20GovInit = (params) => {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "__ERC20Gov_init",
      type: "function",
      inputs: [
        {
          internalType: "address",
          name: "_govAddress",
          type: "address",
        },
        {
          components: [
            {
              internalType: "string",
              name: "name",
              type: "string",
            },
            {
              internalType: "string",
              name: "symbol",
              type: "string",
            },
            {
              internalType: "address[]",
              name: "users",
              type: "address[]",
            },
            {
              internalType: "uint256",
              name: "cap",
              type: "uint256",
            },
            {
              internalType: "uint256",
              name: "mintedTotal",
              type: "uint256",
            },
            {
              internalType: "uint256[]",
              name: "amounts",
              type: "uint256[]",
            },
          ],
          internalType: "struct IERC20Gov.ConstructorParams",
          name: "params",
          type: "tuple",
        },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
    params,
  );
};

module.exports = {
  getBytesERC20GovInit,
};
