const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const treasuryAddress = "";
const dividendsAddress = "";

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const insurance = await deployer.deploy("Insurance");

  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.INSURANCE_NAME(), insurance.address),
    "AddProxy Insurance"
  );
  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.TREASURY_NAME(), insurance.address),
    "Add Treasury"
  );
  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.DIVIDENDS_NAME(), insurance.address),
    "Add Dividends"
  );
};
