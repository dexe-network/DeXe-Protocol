const ContractsRegistry = artifacts.require("ContractsRegistry");
const TransparentUpgradeableProxy = artifacts.require("TransparentUpgradeableProxy");

// TODO change to DAO address
const proxyAdmin = "0xEd498E75d471C3b874461a87Bb7146453CC8175A";

module.exports = async (deployer, logger) => {
  const contractsRegistry = await deployer.deploy(ContractsRegistry);
  const proxy = await deployer.deploy(TransparentUpgradeableProxy, contractsRegistry.address, proxyAdmin, []);

  logger.logTransaction(
    await (await ContractsRegistry.at(proxy.address)).__OwnableContractsRegistry_init(),
    "Init ContractsRegistry"
  );
};
