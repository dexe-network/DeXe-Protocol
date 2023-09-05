const config = require("./config/config.json");

const Proxy = artifacts.require("ERC1967Proxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");
const BABT = artifacts.require("BABTMock");
const DexeExpertNft = artifacts.require("ERC721Expert");

module.exports = async (deployer, logger) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  // TODO use `config.tokens.BABT` instead
  const babtAddress = (await deployer.deploy(BABT)).address;
  const nftAddress = (await deployer.deploy(DexeExpertNft)).address;

  logger.logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), config.tokens.BUSD),
    "Add USD"
  );
  logger.logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), config.tokens.DEXE),
    "Add DEXE"
  );
  logger.logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), babtAddress),
    "Add BABT"
  );
  logger.logTransaction(
    await contractsRegistry.addProxyContract(await contractsRegistry.DEXE_EXPERT_NFT_NAME(), nftAddress),
    "Add Global Expert Nft"
  );
};
