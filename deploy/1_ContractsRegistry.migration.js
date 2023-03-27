const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC1967Proxy = artifacts.require("ERC1967Proxy");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await deployer.deploy(ContractsRegistry);
  const proxy = await deployer.deploy(ERC1967Proxy, contractsRegistry.address, "0x");

  logger.logTransaction(
    await (await ContractsRegistry.at(proxy.address)).__OwnableContractsRegistry_init(),
    "Init ContractsRegistry"
  );
};
