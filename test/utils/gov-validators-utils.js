const getBytesChangeInternalBalances = (users, amounts) => {
  return web3.eth.abi.encodeParameters(["address[]", "uint256[]"], [users, amounts]);
};

const getBytesChangeValidatorSettings = ([duration, executionDelay, quorum]) => {
  return web3.eth.abi.encodeParameters(["uint64", "uint64", "uint128"], [duration, executionDelay, quorum]);
};

const getBytesChangeCreditLimit = (users, amounts, destination) => {
  return web3.eth.abi.encodeParameters(["address[]", "uint256[]", "address"], [users, amounts, destination]);
};

module.exports = {
  getBytesChangeInternalBalances,
  getBytesChangeValidatorSettings,
  getBytesChangeCreditLimit,
};
