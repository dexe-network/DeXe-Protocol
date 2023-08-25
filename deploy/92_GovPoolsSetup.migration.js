const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const PoolRegistry = artifacts.require("PoolRegistry");

const GovUserKeeperViewLib = artifacts.require("GovUserKeeperView");
const GovPoolCreateLib = artifacts.require("GovPoolCreate");
const GovPoolExecuteLib = artifacts.require("GovPoolExecute");
const GovPoolMicropoolLib = artifacts.require("GovPoolMicropool");
const GovPoolRewardsLib = artifacts.require("GovPoolRewards");
const GovPoolUnlockLib = artifacts.require("GovPoolUnlock");
const GovPoolVoteLib = artifacts.require("GovPoolVote");
const GovPoolViewLib = artifacts.require("GovPoolView");
const GovPoolOffchainLib = artifacts.require("GovPoolOffchain");
const GovPoolCreditLib = artifacts.require("GovPoolCredit");
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
const ERC721Expert = artifacts.require("ERC721Expert");
const ERC721Multiplier = artifacts.require("ERC721Multiplier");
const LinearPower = artifacts.require("LinearPower");
const PolynomialPower = artifacts.require("PolynomialPower");

async function linkGovPool(deployer) {
  await deployer.deploy(GovPoolCreateLib);
  await deployer.deploy(GovPoolExecuteLib);
  await deployer.deploy(GovPoolMicropoolLib);
  await deployer.deploy(GovPoolRewardsLib);
  await deployer.deploy(GovPoolUnlockLib);
  await deployer.deploy(GovPoolVoteLib);
  await deployer.deploy(GovPoolViewLib);
  await deployer.deploy(GovPoolOffchainLib);
  await deployer.deploy(GovPoolCreditLib);

  await deployer.link(GovPoolCreateLib, GovPool);
  await deployer.link(GovPoolExecuteLib, GovPool);
  await deployer.link(GovPoolMicropoolLib, GovPool);
  await deployer.link(GovPoolRewardsLib, GovPool);
  await deployer.link(GovPoolUnlockLib, GovPool);
  await deployer.link(GovPoolVoteLib, GovPool);
  await deployer.link(GovPoolViewLib, GovPool);
  await deployer.link(GovPoolOffchainLib, GovPool);
  await deployer.link(GovPoolCreditLib, GovPool);
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
  const expertNft = await deployer.deploy(ERC721Expert);
  const nftMultiplier = await deployer.deploy(ERC721Multiplier);
  const linearPower = await deployer.deploy(LinearPower);
  const polynomialPower = await deployer.deploy(PolynomialPower);

  const govPoolName = await poolRegistry.GOV_POOL_NAME();
  const govSettingsName = await poolRegistry.SETTINGS_NAME();
  const govValidatorsName = await poolRegistry.VALIDATORS_NAME();
  const govUserKeeperName = await poolRegistry.USER_KEEPER_NAME();
  const distributionProposalName = await poolRegistry.DISTRIBUTION_PROPOSAL_NAME();
  const tokenSaleProposalName = await poolRegistry.TOKEN_SALE_PROPOSAL_NAME();
  const expertNftName = await poolRegistry.EXPERT_NFT_NAME();
  const nftMultiplierName = await poolRegistry.NFT_MULTIPLIER_NAME();
  const linearPowerName = await poolRegistry.LINEAR_POWER_NAME();
  const polynomialPowerName = await poolRegistry.POLYNOMIAL_POWER_NAME();

  logger.logTransaction(
    await poolRegistry.setNewImplementations(
      [
        govPoolName,
        govSettingsName,
        govValidatorsName,
        govUserKeeperName,
        distributionProposalName,
        tokenSaleProposalName,
        expertNftName,
        nftMultiplierName,
        linearPowerName,
        polynomialPowerName,
      ],
      [
        govPool.address,
        govSettings.address,
        govValidators.address,
        govUserKeeper.address,
        distributionProposal.address,
        tokenSaleProposal.address,
        expertNft.address,
        nftMultiplier.address,

        linearPower.address,
        polynomialPower.address,
      ]
    ),
    "Set GovPools implementations"
  );
};
