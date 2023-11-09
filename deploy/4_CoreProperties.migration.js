const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const CoreProperties = artifacts.require("CoreProperties");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const coreProperties = await deployer.deploy(CoreProperties);

  logger.logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), coreProperties.address),
    "AddProxy CoreProperties"
  );
};
