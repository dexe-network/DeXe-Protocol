const config = require("./config/utils.js").getConfig();

const ContractsRegistry = artifacts.require("ContractsRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  await contractsRegistry.addContract(await contractsRegistry.NETWORK_PROPERTIES_NAME(), config.NETWORK_PROPERTIES);
};
