const BigNumber = require("bignumber.js");
const toBN = (value) => new BigNumber(value);

const deploy = async (name, ...args) => {
  try {
    console.log("\tDeploying", name, "\n");

    const Instance = artifacts.require(name);
    Instance.numberFormat = "BigNumber";

    const gasLimit = toBN(await Instance.new.estimateGas(...args));
    const gasPrice = toBN(await web3.eth.getGasPrice());
    const deploymentCost = gasLimit.times(gasPrice);
    const instance = await Instance.new(...args);

    console.log("Name:", name);
    console.log("Address:", await instance.address);
    console.log("GasLimit:", gasLimit.toFixed());
    console.log("GasPrice:", gasPrice.toFixed());
    console.log("Cost:", web3.utils.fromWei(deploymentCost.toFixed()), "ETH\n");

    Instance.setAsDeployed(instance);

    return instance;
  } catch (e) {
    console.log(e);
  }
};

module.exports = deploy;
