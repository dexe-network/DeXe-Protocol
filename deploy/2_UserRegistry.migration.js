const { logTransaction } = require("@dlsl/hardhat-migrate/dist/src/logger/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const UserRegistry = artifacts.require("UserRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const userRegistry = await deployer.deploy(UserRegistry);

  logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.USER_REGISTRY_NAME(), userRegistry.address),
    "Add UserRegistry"
  );
};
