const ContractsRegistry = artifacts.require("ContractsRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
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
const StakingProposal = artifacts.require("StakingProposal");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  const poolRegistry = await deployer.deployed(PoolRegistry, await contractsRegistry.getPoolRegistryContract());

  const govPool = await deployer.deploy(GovPool);
  const govValidators = await deployer.deploy(GovValidators);
  const govUserKeeper = await deployer.deploy(GovUserKeeper);

  const tokenSaleProposal = await deployer.deploy(TokenSaleProposal);
  const distributionProposal = await deployer.deploy(DistributionProposal);

  const govSettings = await deployer.deploy(GovSettings);
  const expertNft = await deployer.deploy(ERC721Expert, { name: "LocalExpert" });
  const nftMultiplier = await deployer.deploy(ERC721Multiplier);
  const linearPower = await deployer.deploy(LinearPower);
  const polynomialPower = await deployer.deploy(PolynomialPower);

  const stakingProposal = await deployer.deployed(ContractsRegistry, "StakingProposalContract");

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
  const stakingProposalName = await poolRegistry.STAKING_PROPOSAL_NAME();

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
      stakingProposalName,
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
      stakingProposal.address,
    ],
  );
};
