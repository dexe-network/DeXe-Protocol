const { toBN, accounts, wei } = require("../../scripts/helpers/utils");
const { logTransaction } = require("../runners/logger.js");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");

const ERC20Mock = artifacts.require("ERC20Mock");

const PriceFeed = artifacts.require("PriceFeedMock");
const UniswapV2Router = artifacts.require("UniswapV2RouterMock");

ERC20Mock.numberFormat = "BigNumber";

const testBaseTokens = {
  DAI: 18,
  DEXE: 18,
  WETH: 18,
  USDT: 6,
  MANA: 18,
  WBTC: 8,
};

const testPathTokens = ["DAI", "WETH", "USDT", "WBTC"];

async function getAndDeployBaseAddresses(deployer, deployedTokens) {
  let keys = Object.keys(testBaseTokens);
  let baseAddresses = [];

  for (let i = 0; i < keys.length; i++) {
    if (!(keys[i] in deployedTokens)) {
      const token = await deployer.deploy(ERC20Mock, keys[i], keys[i], testBaseTokens[keys[i]]);

      deployedTokens[keys[i]] = token.address;
    }

    baseAddresses.push(deployedTokens[keys[i]]);
  }

  return baseAddresses;
}

async function getPathAddresses(deployedTokens) {
  let pathAddresses = [];

  for (let i = 0; i < testPathTokens.length; i++) {
    pathAddresses.push(deployedTokens[testPathTokens[i]]);
  }

  return pathAddresses;
}

async function configureReserves(uniswapV2Router, baseAddresses) {
  const OWNER = await accounts(0);

  const tokensToMint = toBN(1000000000);
  const reserveTokens = toBN(1000000);

  for (let i = 0; i < baseAddresses.length; i++) {
    const baseToken = await ERC20Mock.at(baseAddresses[i]);
    const baseDecimals = (await baseToken.decimals()).toNumber();

    await baseToken.mint(OWNER, wei(tokensToMint, baseDecimals));

    await baseToken.approve(uniswapV2Router.address, wei(reserveTokens, baseDecimals));
    await uniswapV2Router.setReserve(baseToken.address, wei(reserveTokens, baseDecimals));
  }
}

async function configurePriceFeedTokens(priceFeed, baseAddresses, pathAddresses) {
  logTransaction(await priceFeed.addSupportedBaseTokens(baseAddresses), "Add supported base tokens");
  logTransaction(await priceFeed.setPathTokens(pathAddresses), "Add supported path tokens");
}

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);

  const priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());
  const uniswapV2Router = await UniswapV2Router.at(await contractsRegistry.getUniswapV2RouterContract());

  let deployedTokens = {
    DAI: await contractsRegistry.getDAIContract(),
    DEXE: await contractsRegistry.getDEXEContract(),
  };

  let baseAddresses = await getAndDeployBaseAddresses(deployer, deployedTokens);
  let pathAddresses = await getPathAddresses(deployedTokens);

  await configureReserves(uniswapV2Router, baseAddresses);

  // only this code in needed for production
  await configurePriceFeedTokens(priceFeed, baseAddresses, pathAddresses);
};
