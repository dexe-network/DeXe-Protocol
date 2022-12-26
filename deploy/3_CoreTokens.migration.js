const { logTransaction } = require("@dlsl/hardhat-migrate");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");
const ERC20Mock = artifacts.require("ERC20Mock");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);
  const USD = await deployer.deploy(ERC20Mock, "USD", "USD", 18);
  const DEXE = await deployer.deploy(ERC20Mock, "DEXE", "DEXE", 18);

  logTransaction(await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address), "Add USD");
  logTransaction(await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address), "Add DEXE");
};
