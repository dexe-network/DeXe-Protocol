const { logTransaction } = require("../runners/logger.js");

const ContractsRegistry = artifacts.require("ContractsRegistry");

const proxyAdmin = "0x53638975BC11de3029E46DF193d64879EAeA94eB";

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deploy("ContractsRegistry");
  const proxy = await deployer.deploy("TransparentUpgradeableProxy", contractsRegistry.address, proxyAdmin, []);

  logTransaction(
    await (await ContractsRegistry.at(proxy.address)).__ContractsRegistry_init(),
    "Init ContractsRegistry"
  );
};
