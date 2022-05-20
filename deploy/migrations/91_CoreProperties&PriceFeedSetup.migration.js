const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const CoreProperties = artifacts.require("CoreProperties");
const PriceFeed = artifacts.require("PriceFeed");

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());
  const coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());

  let whitelistAddresses = [
    "0xae13d989dac2f0debff460ac112a837c89baa7cd", // WBNB
    "0x7ef95a0fee0dd31b22626fa2e10ee6a223f8a684", // USDT
    "0x8babbb98678facc7342735486c851abd7a0d17ca", // WETH
    "0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7", // BUSD
    "0x8a9424745056Eb399FD19a0EC26A14316684e274", // DAI
    "0xf9f93cf501bfadb6494589cb4b4c15de49e85d0e", // pancake
  ];

  let blacklistAddresses = [
    "0xDAcbdeCc2992a63390d108e8507B98c7E2B5584a", // SAFEMOON
  ];

  let pathAddresses = [
    "0xae13d989dac2f0debff460ac112a837c89baa7cd", // WBNB
    "0x7ef95a0fee0dd31b22626fa2e10ee6a223f8a684", // USDT
    "0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7", // BUSD
  ];

  logTransaction(await coreProperties.addWhitelistTokens(whitelistAddresses), "Add whitelist tokens");
  logTransaction(await coreProperties.addBlacklistTokens(blacklistAddresses), "Add blacklist tokens");
  logTransaction(await priceFeed.addPathTokens(pathAddresses), "Add supported path tokens");
};
