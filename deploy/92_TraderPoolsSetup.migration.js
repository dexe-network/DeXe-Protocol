const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const PoolRegistry = artifacts.require("PoolRegistry");

const TraderPoolCommissionLib = artifacts.require("TraderPoolCommission");
const TraderPoolLeverageLib = artifacts.require("TraderPoolLeverage");
const TraderPoolPriceLib = artifacts.require("TraderPoolPrice");
const TraderPoolExchangeLib = artifacts.require("TraderPoolExchange");
const TraderPoolInvestLib = artifacts.require("TraderPoolInvest");
const TraderPoolDivestLib = artifacts.require("TraderPoolDivest");
const TraderPoolModifyLib = artifacts.require("TraderPoolModify");
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

  await deployer.link(TraderPoolCommissionLib, TraderPoolDivestLib);

  await deployer.link(TraderPoolPriceLib, TraderPoolInvestLib);
  await deployer.link(TraderPoolLeverageLib, TraderPoolInvestLib);

  await deployer.link(TraderPoolCommissionLib, TraderPoolViewLib);
  await deployer.link(TraderPoolPriceLib, TraderPoolViewLib);
  await deployer.link(TraderPoolLeverageLib, TraderPoolViewLib);

  await deployer.deploy(TraderPoolExchangeLib);
  await deployer.deploy(TraderPoolViewLib);
  await deployer.deploy(TraderPoolInvestLib);
  await deployer.deploy(TraderPoolDivestLib);
  await deployer.deploy(TraderPoolModifyLib);

  await deployer.link(TraderPoolCommissionLib, BasicTraderPool, InvestTraderPool);
  await deployer.link(TraderPoolInvestLib, BasicTraderPool, InvestTraderPool);
  await deployer.link(TraderPoolDivestLib, BasicTraderPool, InvestTraderPool);
  await deployer.link(TraderPoolModifyLib, BasicTraderPool, InvestTraderPool);
  await deployer.link(TraderPoolExchangeLib, BasicTraderPool, InvestTraderPool);
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

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

  await link(deployer);

  const basicTraderPool = await deployer.deploy(BasicTraderPool);
  const investTraderPool = await deployer.deploy(InvestTraderPool);
  const riskyPoolProposal = await deployer.deploy(RiskyPoolProposal);
  const investPoolProposal = await deployer.deploy(InvestPoolProposal);

  const basicPoolName = await poolRegistry.BASIC_POOL_NAME();
  const investPoolName = await poolRegistry.INVEST_POOL_NAME();
  const riskyProposalName = await poolRegistry.RISKY_PROPOSAL_NAME();
  const investProposalName = await poolRegistry.INVEST_PROPOSAL_NAME();

  logger.logTransaction(
    await poolRegistry.setNewImplementations(
      [basicPoolName, investPoolName, riskyProposalName, investProposalName],
      [basicTraderPool.address, investTraderPool.address, riskyPoolProposal.address, investPoolProposal.address]
    ),
    "Set TraderPools implementations"
  );
};
