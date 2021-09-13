const { web3 } = require("hardhat");

const setNextBlockTime = async (time) => {
  return await network.provider.send("evm_setNextBlockTimestamp", [time]);
};

const getCurrentBlockTime = async () => {
  return (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
};

module.exports = {
  getCurrentBlockTime,
  setNextBlockTime,
};
