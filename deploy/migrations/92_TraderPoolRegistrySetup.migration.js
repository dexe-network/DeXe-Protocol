const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");

const TraderPoolHelper = artifacts.require("TraderPoolHelper");

const BasicTraderPool = artifacts.require("BasicTraderPool");
const RiskyTraderPool = artifacts.require("RiskyTraderPool");
const InvestTraderPool = artifacts.require("InvestTraderPool");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());

  await deployer.deploy(TraderPoolHelper);

  await deployer.link(TraderPoolHelper, BasicTraderPool, RiskyTraderPool, InvestTraderPool);

  const basicTraderPool = await deployer.deploy(BasicTraderPool);
  const riskyTraderPool = await deployer.deploy(RiskyTraderPool);
  const investTraderPool = await deployer.deploy(InvestTraderPool);

  const basicPoolName = await traderPoolRegistry.BASIC_POOL_NAME();
  const riskyPoolName = await traderPoolRegistry.RISKY_POOL_NAME();
  const investPoolName = await traderPoolRegistry.INVEST_POOL_NAME();

  logTransaction(
    await traderPoolRegistry.setNewImplementations(
      [basicPoolName, riskyPoolName, investPoolName],
      [basicTraderPool.address, riskyTraderPool.address, investTraderPool.address]
    ),
    "Set TraderPools implementations"
  );
};
