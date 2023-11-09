const ContractsRegistry = artifacts.require("ContractsRegistry");
const CoreProperties = artifacts.require("CoreProperties");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const coreProperties = await deployer.deploy(CoreProperties);

  await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), coreProperties.address);
};
