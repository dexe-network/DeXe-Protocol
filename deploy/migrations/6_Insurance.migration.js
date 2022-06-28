const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const Insurance = artifacts.require("Insurance");

// TODO change to actual addresses
const treasuryAddress = "0x53638975BC11de3029E46DF193d64879EAeA94eB";
const dividendsAddress = "0x53638975BC11de3029E46DF193d64879EAeA94eB";

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const insurance = await deployer.deploy(Insurance);

  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.INSURANCE_NAME(), insurance.address),
    "AddProxy Insurance"
  );
  logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), treasuryAddress),
    "Add Treasury"
  );
  logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), dividendsAddress),
    "Add Dividends"
  );
};
