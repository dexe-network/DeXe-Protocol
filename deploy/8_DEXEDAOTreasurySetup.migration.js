const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolFactory = artifacts.require("PoolFactory");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const poolFactory = await PoolFactory.at(await contractsRegistry.getPoolFactoryContract());

  // TODO: fix this
  const addressThis = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const treasury = (await poolFactory.predictGovAddresses(addressThis, "DEXE DAO"))[0];

  logger.logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), treasury),
    "Add Treasury"
  );
};
