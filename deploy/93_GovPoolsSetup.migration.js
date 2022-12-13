const { logTransaction } = require("@dlsl/hardhat-migrate");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const PoolRegistry = artifacts.require("PoolRegistry");

const GovUserKeeperViewLib = artifacts.require("GovUserKeeperView");
const GovPoolCreateLib = artifacts.require("GovPoolCreate");
const GovPoolExecuteLib = artifacts.require("GovPoolExecute");
const GovPoolRewardsLib = artifacts.require("GovPoolRewards");
const GovPoolUnlockLib = artifacts.require("GovPoolUnlock");
const GovPoolVoteLib = artifacts.require("GovPoolVote");
const GovPoolViewLib = artifacts.require("GovPoolView");

const GovPool = artifacts.require("GovPool");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const DistributionProposal = artifacts.require("DistributionProposal");

async function link(deployer) {
  await deployer.deploy(GovUserKeeperViewLib);

  await deployer.deploy(GovPoolCreateLib);
  await deployer.deploy(GovPoolExecuteLib);
  await deployer.deploy(GovPoolRewardsLib);
  await deployer.deploy(GovPoolUnlockLib);
  await deployer.deploy(GovPoolVoteLib);
  await deployer.deploy(GovPoolViewLib);

  await deployer.link(GovUserKeeperViewLib, GovUserKeeper);

  await deployer.link(GovPoolCreateLib, GovPool);
  await deployer.link(GovPoolExecuteLib, GovPool);
  await deployer.link(GovPoolRewardsLib, GovPool);
  await deployer.link(GovPoolUnlockLib, GovPool);
  await deployer.link(GovPoolVoteLib, GovPool);
  await deployer.link(GovPoolViewLib, GovPool);
}

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

  await link(deployer);

  const govPool = await deployer.deploy(GovPool);
  const govSettings = await deployer.deploy(GovSettings);
  const govValidators = await deployer.deploy(GovValidators);
  const govUserKeeper = await deployer.deploy(GovUserKeeper);
  const distributionProposal = await deployer.deploy(DistributionProposal);

  const govPoolName = await poolRegistry.GOV_POOL_NAME();
  const govSettingsName = await poolRegistry.SETTINGS_NAME();
  const govValidatorsName = await poolRegistry.VALIDATORS_NAME();
  const govUserKeeperName = await poolRegistry.USER_KEEPER_NAME();
  const distributionProposalName = await poolRegistry.DISTRIBUTION_PROPOSAL_NAME();

  logTransaction(
    await poolRegistry.setNewImplementations(
      [govPoolName, govSettingsName, govValidatorsName, govUserKeeperName, distributionProposalName],
      [govPool.address, govSettings.address, govValidators.address, govUserKeeper.address, distributionProposal.address]
    ),
    "Set GovPools implementations"
  );
};
