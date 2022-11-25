const { logTransaction } = require("@dlsl/hardhat-migrate");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

// BSC TESTNET
const UniswapV2RouterAddress = "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3";
const UniswapV2FactoryAddress = "0xb7926c0430afb07aa7defde6da862ae0bde767bc";

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), UniswapV2RouterAddress),
    "Add UniswapV2Router"
  );

  logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), UniswapV2FactoryAddress),
    "Add UniswapV2Factory"
  );
};
