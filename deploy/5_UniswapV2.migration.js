const { logTransaction, logContracts } = require("@dlsl/hardhat-migrate");
const { toBN, wei } = require("../scripts/utils/utils");

const Proxy = artifacts.require("TransparentUpgradeableProxy");
const ContractsRegistry = artifacts.require("ContractsRegistry");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const ERC20Mock = artifacts.require("ERC20Mock");

const tokensToMint = toBN(1000000000);
const reserveTokens = toBN(1000000);
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

module.exports = async (deployer) => {
  const contractsRegistry = await ContractsRegistry.at((await Proxy.deployed()).address);
  const uniswapMock = await deployer.deploy(UniswapV2RouterMock);

  const USD = await ERC20Mock.at(await contractsRegistry.getUSDContract());
  const DEXE = await ERC20Mock.at(await contractsRegistry.getDEXEContract());
  const WBNB = await deployer.deploy(ERC20Mock, "WBNB", "WBNB", 18);
  const WETH = await deployer.deploy(ERC20Mock, "WETH", "WETH", 18);
  const CAKE = await deployer.deploy(ERC20Mock, "CAKE", "CAKE", 18);
  const SAFEMOON = await deployer.deploy(ERC20Mock, "SAFEMOON", "SAFEMOON", 18);

  await DEXE.mint(OWNER, wei(tokensToMint));
  await USD.mint(OWNER, wei(tokensToMint));
  await WBNB.mint(OWNER, wei(tokensToMint));
  await WETH.mint(OWNER, wei(tokensToMint));
  await CAKE.mint(OWNER, wei(tokensToMint));
  await SAFEMOON.mint(OWNER, wei(tokensToMint));

  await DEXE.approve(uniswapMock.address, wei(reserveTokens));
  await uniswapMock.setReserve(DEXE.address, wei(reserveTokens));

  await USD.approve(uniswapMock.address, wei(reserveTokens));
  await uniswapMock.setReserve(USD.address, wei(reserveTokens.idiv(2)));

  await WBNB.approve(uniswapMock.address, wei(reserveTokens));
  await uniswapMock.setReserve(WBNB.address, wei(reserveTokens.idiv(3)));

  await WETH.approve(uniswapMock.address, wei(reserveTokens));
  await uniswapMock.setReserve(WETH.address, wei(reserveTokens.idiv(3)));

  await CAKE.approve(uniswapMock.address, wei(reserveTokens));
  await uniswapMock.setReserve(CAKE.address, wei(reserveTokens));

  await SAFEMOON.approve(uniswapMock.address, wei(reserveTokens));
  await uniswapMock.setReserve(SAFEMOON.address, wei(reserveTokens));

  await uniswapMock.enablePair(DEXE.address, USD.address);
  await uniswapMock.enablePair(DEXE.address, WBNB.address);
  await uniswapMock.enablePair(DEXE.address, WETH.address);
  await uniswapMock.enablePair(DEXE.address, CAKE.address);
  await uniswapMock.enablePair(DEXE.address, SAFEMOON.address);

  await uniswapMock.enablePair(WBNB.address, USD.address);
  await uniswapMock.enablePair(WBNB.address, WETH.address);
  await uniswapMock.enablePair(WBNB.address, CAKE.address);
  await uniswapMock.enablePair(WBNB.address, SAFEMOON.address);

  await uniswapMock.enablePair(WETH.address, USD.address);
  await uniswapMock.enablePair(WETH.address, CAKE.address);
  await uniswapMock.enablePair(WETH.address, SAFEMOON.address);

  await uniswapMock.enablePair(CAKE.address, USD.address);
  await uniswapMock.enablePair(CAKE.address, SAFEMOON.address);

  await uniswapMock.enablePair(SAFEMOON.address, USD.address);

  logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapMock.address),
    "Add UniswapV2Router"
  );

  logTransaction(
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), uniswapMock.address),
    "Add UniswapV2Factory"
  );

  logContracts(
    ["DEXE", DEXE.address],
    ["USD", USD.address],
    ["WBNB", WBNB.address],
    ["WETH", WETH.address],
    ["CAKE", CAKE.address],
    ["SAFEMOON", SAFEMOON.address]
  );
};
