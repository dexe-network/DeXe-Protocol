const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const UserRegistry = artifacts.require("UserRegistry");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const userRegistry = await deployer.deploy(UserRegistry);

  logger.logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.USER_REGISTRY_NAME(), userRegistry.address),
    "Add UserRegistry"
  );
};
