const config = require("./config/utils.js").getConfig();

const ContractsRegistry = artifacts.require("ContractsRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), config.uniswap.router);
  await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), config.uniswap.factory);
};
