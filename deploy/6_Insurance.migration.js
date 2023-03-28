const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const Insurance = artifacts.require("Insurance");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const insurance = await deployer.deploy(Insurance);

  logger.logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.INSURANCE_NAME(), insurance.address),
    "AddProxy Insurance"
  );
};
