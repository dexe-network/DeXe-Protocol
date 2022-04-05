const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");

const TraderPoolCommissionLib = artifacts.require("TraderPoolCommission");
const TraderPoolLeverageLib = artifacts.require("TraderPoolLeverage");
const TraderPoolPriceLib = artifacts.require("TraderPoolPrice");
const TraderPoolViewLib = artifacts.require("TraderPoolView");
const InvestPoolProposalLib = artifacts.require("TraderPoolInvestProposalView");
const RiskyPoolProposalLib = artifacts.require("TraderPoolRiskyProposalView");

const BasicTraderPool = artifacts.require("BasicTraderPool");
const InvestTraderPool = artifacts.require("InvestTraderPool");
const RiskyPoolProposal = artifacts.require("TraderPoolRiskyProposal");
const InvestPoolProposal = artifacts.require("TraderPoolInvestProposal");

async function linkPools(deployer) {
  await deployer.deploy(TraderPoolPriceLib);
  await deployer.link(TraderPoolPriceLib, TraderPoolLeverageLib);

  await deployer.deploy(TraderPoolCommissionLib);
  await deployer.deploy(TraderPoolLeverageLib);

  await deployer.link(TraderPoolCommissionLib, TraderPoolViewLib);
  await deployer.link(TraderPoolPriceLib, TraderPoolViewLib);
  await deployer.link(TraderPoolLeverageLib, TraderPoolViewLib);

  await deployer.deploy(TraderPoolViewLib);

  await deployer.link(TraderPoolPriceLib, BasicTraderPool, InvestTraderPool);
  await deployer.link(TraderPoolCommissionLib, BasicTraderPool, InvestTraderPool);
  await deployer.link(TraderPoolLeverageLib, BasicTraderPool, InvestTraderPool);
  await deployer.link(TraderPoolViewLib, BasicTraderPool, InvestTraderPool);
}

async function linkProposals(deployer) {
  await deployer.deploy(RiskyPoolProposalLib);
  await deployer.deploy(InvestPoolProposalLib);

  await deployer.link(RiskyPoolProposalLib, RiskyPoolProposal);
  await deployer.link(InvestPoolProposalLib, InvestPoolProposal);
}

async function link(deployer) {
  await linkPools(deployer);
  await linkProposals(deployer);
}

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());

  await link(deployer);

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
      [basicPoolName, investPoolName, riskyProposalName, investProposalName],
      [basicTraderPool.address, investTraderPool.address, riskyPoolProposal.address, investPoolProposal.address]
    ),
    "Set TraderPools implementations"
  );
};
