const getBytesChangeInternalBalances = (users, amounts) => {
  return web3.eth.abi.encodeParameters(["address[]", "uint256[]"], [users, amounts]);
};

module.exports = {
  getBytesChangeInternalBalances,
};
