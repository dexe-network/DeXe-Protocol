const config = require("./config/utils.js").getConfig();

const { ZERO_ADDR } = require("../scripts/utils/constants");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const BABT = artifacts.require("BABTMock");
const DexeExpertNft = artifacts.require("ERC721Expert");

module.exports = async (deployer) => {
  const contractsRegistry = await deployer.deployed(ContractsRegistry, "proxy");

  let babtAddress = config.tokens.BABT;

  if (babtAddress == ZERO_ADDR) {
    babtAddress = (await deployer.deploy(BABT)).address;
  }

  const nftAddress = (await deployer.deploy(DexeExpertNft, { name: "GlobalExpert" })).address;

  await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), config.tokens.BUSD);
  await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), config.tokens.DEXE);
  await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), babtAddress);
  await contractsRegistry.addProxyContract(await contractsRegistry.DEXE_EXPERT_NFT_NAME(), nftAddress);
};
