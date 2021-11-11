const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());

  // deploy & link libs
  // add impls to registry

  const basicTraderPool = await deployer.deploy("BasicTraderPool");
  const riskyTraderPool = await deployer.deploy("RiskyTraderPool");
  const investTraderPool = await deployer.deploy("InvestTraderPool");
};
