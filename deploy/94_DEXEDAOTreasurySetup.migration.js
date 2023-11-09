const ContractsRegistry = artifacts.require("ContractsRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());
};
