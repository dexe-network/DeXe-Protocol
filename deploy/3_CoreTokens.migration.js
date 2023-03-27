const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");
const BABT = artifacts.require("BABTMock");

// BSC TESTNET
const usdAddress = "0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7"; // BUSD
const dexeAddress = "0xa651EdBbF77e1A2678DEfaE08A33c5004b491457";
let babtAddress = "";

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  // TODO remove
  babtAddress = (await deployer.deploy(BABT)).address;

  logger.logTransaction(await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), usdAddress), "Add USD");
  logger.logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), dexeAddress),
    "Add DEXE"
  );
  logger.logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), babtAddress),
    "Add BABT"
  );
};
