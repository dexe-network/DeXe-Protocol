const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const dai = await deployer.deploy("ERC20Mock", "DAI", "DAI", 18);
  const dexe = await deployer.deploy("ERC20Mock", "DEXE", "DEXE", 18);

  logTransaction(await contractsRegistry.addContract(await contractsRegistry.DAI_NAME(), dai.address), "Add DAI");
  logTransaction(await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), dexe.address), "Add DEXE");
};
