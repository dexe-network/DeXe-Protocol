const { getDexeDaoAddress } = require("./utils/utils");

const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const dexeDaoAddress = await getDexeDaoAddress();

  logger.logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), dexeDaoAddress),
    "Add Treasury"
  );
  logger.logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), dexeDaoAddress),
    "Add Dividends"
  );
  logger.logTransaction(
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME()),
    "Inject CoreProperties"
  );
};
