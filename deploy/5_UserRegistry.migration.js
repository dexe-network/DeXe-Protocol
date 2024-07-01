const ContractsRegistry = artifacts.require("ContractsRegistry");
const UserRegistry = artifacts.require("UserRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");
  const userRegistry = await deployer.deploy(UserRegistry);

  await contractsRegistry.addProxyContract(await contractsRegistry.USER_REGISTRY_NAME(), userRegistry.address);
};
