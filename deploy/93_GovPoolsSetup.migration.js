const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const PoolRegistry = artifacts.require("PoolRegistry");

const GovUserKeeperViewLib = artifacts.require("GovUserKeeperView");
const GovPoolCreateLib = artifacts.require("GovPoolCreate");
const GovPoolExecuteLib = artifacts.require("GovPoolExecute");
const GovPoolRewardsLib = artifacts.require("GovPoolRewards");
const GovPoolUnlockLib = artifacts.require("GovPoolUnlock");
const GovPoolVoteLib = artifacts.require("GovPoolVote");
const GovPoolViewLib = artifacts.require("GovPoolView");
const GovPoolStakingLib = artifacts.require("GovPoolStaking");
const GovPoolOffchainLib = artifacts.require("GovPoolOffchain");
const TokenSaleProposalCreateLib = artifacts.require("TokenSaleProposalCreate");
const TokenSaleProposalBuyLib = artifacts.require("TokenSaleProposalBuy");
const TokenSaleProposalVestingLib = artifacts.require("TokenSaleProposalVesting");
const TokenSaleProposalWhitelistLib = artifacts.require("TokenSaleProposalWhitelist");
const TokenSaleProposalClaimLib = artifacts.require("TokenSaleProposalClaim");
const TokenSaleProposalRecoverLib = artifacts.require("TokenSaleProposalRecover");

const GovPool = artifacts.require("GovPool");
const GovSettings = artifacts.require("GovSettings");
const GovValidators = artifacts.require("GovValidators");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const DistributionProposal = artifacts.require("DistributionProposal");
const TokenSaleProposal = artifacts.require("TokenSaleProposal");

async function linkGovPool(deployer) {
  await deployer.deploy(GovPoolCreateLib);
  await deployer.deploy(GovPoolExecuteLib);
  await deployer.deploy(GovPoolRewardsLib);
  await deployer.deploy(GovPoolUnlockLib);
  await deployer.deploy(GovPoolVoteLib);
  await deployer.deploy(GovPoolViewLib);
  await deployer.deploy(GovPoolStakingLib);
  await deployer.deploy(GovPoolOffchainLib);

  await deployer.link(GovPoolCreateLib, GovPool);
  await deployer.link(GovPoolExecuteLib, GovPool);
  await deployer.link(GovPoolRewardsLib, GovPool);
  await deployer.link(GovPoolUnlockLib, GovPool);
  await deployer.link(GovPoolVoteLib, GovPool);
  await deployer.link(GovPoolViewLib, GovPool);
  await deployer.link(GovPoolStakingLib, GovPool);
  await deployer.link(GovPoolOffchainLib, GovPool);
}

async function linkGovUserKeeper(deployer) {
  await deployer.deploy(GovUserKeeperViewLib);

  await deployer.link(GovUserKeeperViewLib, GovUserKeeper);
}

async function linkTokenSaleProposal(deployer) {
  await deployer.deploy(TokenSaleProposalCreateLib);
  await deployer.deploy(TokenSaleProposalBuyLib);
  await deployer.deploy(TokenSaleProposalVestingLib);
  await deployer.deploy(TokenSaleProposalWhitelistLib);
  await deployer.deploy(TokenSaleProposalClaimLib);
  await deployer.deploy(TokenSaleProposalRecoverLib);

  await deployer.link(TokenSaleProposalCreateLib, TokenSaleProposal);
  await deployer.link(TokenSaleProposalBuyLib, TokenSaleProposal);
  await deployer.link(TokenSaleProposalVestingLib, TokenSaleProposal);
  await deployer.link(TokenSaleProposalWhitelistLib, TokenSaleProposal);
  await deployer.link(TokenSaleProposalClaimLib, TokenSaleProposal);
  await deployer.link(TokenSaleProposalRecoverLib, TokenSaleProposal);
}

async function link(deployer) {
  await linkGovUserKeeper(deployer);
  await linkGovPool(deployer);
  await linkTokenSaleProposal(deployer);
}

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

  await link(deployer);

  const govPool = await deployer.deploy(GovPool);
  const govSettings = await deployer.deploy(GovSettings);
  const govValidators = await deployer.deploy(GovValidators);
  const govUserKeeper = await deployer.deploy(GovUserKeeper);
  const distributionProposal = await deployer.deploy(DistributionProposal);
  const tokenSaleProposal = await deployer.deploy(TokenSaleProposal);

  const govPoolName = await poolRegistry.GOV_POOL_NAME();
  const govSettingsName = await poolRegistry.SETTINGS_NAME();
  const govValidatorsName = await poolRegistry.VALIDATORS_NAME();
  const govUserKeeperName = await poolRegistry.USER_KEEPER_NAME();
  const distributionProposalName = await poolRegistry.DISTRIBUTION_PROPOSAL_NAME();
  const tokenSaleProposalName = await poolRegistry.TOKEN_SALE_PROPOSAL_NAME();

  logger.logTransaction(
    await poolRegistry.setNewImplementations(
      [
        govPoolName,
        govSettingsName,
        govValidatorsName,
        govUserKeeperName,
        distributionProposalName,
        tokenSaleProposalName,
      ],
      [
        govPool.address,
        govSettings.address,
        govValidators.address,
        govUserKeeper.address,
        distributionProposal.address,
        tokenSaleProposal.address,
      ]
    ),
    "Set GovPools implementations"
  );
};
