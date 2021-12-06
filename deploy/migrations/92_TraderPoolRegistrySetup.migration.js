const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");

const TraderPoolHelper = artifacts.require("TraderPoolHelper");

const BasicTraderPool = artifacts.require("BasicTraderPool");
const InvestTraderPool = artifacts.require("InvestTraderPool");
const RiskyPoolProposal = artifacts.require("TraderPoolRiskyProposal");
const InvestPoolProposal = artifacts.require("TraderPoolInvestProposal");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());

  await deployer.deploy(TraderPoolHelper);

  await deployer.link(TraderPoolHelper, BasicTraderPool, InvestTraderPool);

  const basicTraderPool = await deployer.deploy(BasicTraderPool);
  const investTraderPool = await deployer.deploy(InvestTraderPool);
  const riskyPoolProposal = await deployer.deploy(RiskyPoolProposal);
  const investPoolProposal = await deployer.deploy(InvestPoolProposal);

  const basicPoolName = await traderPoolRegistry.BASIC_POOL_NAME();
  const investPoolName = await traderPoolRegistry.INVEST_POOL_NAME();
  const riskyProposalName = await traderPoolRegistry.RISKY_PROPOSAL_NAME();
  const investProposalName = await traderPoolRegistry.INVEST_PROPOSAL_NAME();

  logTransaction(
    await traderPoolRegistry.setNewImplementations(
      [basicPoolName, riskyPoolName, investPoolName, riskyProposalName, investProposalName],
      [basicTraderPool.address, investTraderPool.address, riskyProposalName.address, investProposalName.address]
    ),
    "Set TraderPools implementations"
  );
};
