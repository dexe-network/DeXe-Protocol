const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PriceFeed = artifacts.require("PriceFeed");
const UniswapV2PathFinderLib = artifacts.require("UniswapV2PathFinder");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const ERC20Mock = artifacts.require("ERC20Mock");

ContractsRegistry.numberFormat = "BigNumber";
PriceFeed.numberFormat = "BigNumber";
UniswapV2PathFinderLib.numberFormat = "BigNumber";
UniswapV2RouterMock.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

describe("PriceFeed", () => {
  let tokensToMint = toBN(1000000000);
  let reserveTokens = toBN(1000000);

  let OWNER;
  let SECOND;

  let priceFeed;
  let uniswapV2Router;
  let DEXE;
  let USD;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);

    const uniswapV2PathFinderLib = await UniswapV2PathFinderLib.new();

    await PriceFeed.link(uniswapV2PathFinderLib);
  });

  beforeEach("setup", async () => {
    const contractsRegistry = await ContractsRegistry.new();
    const _priceFeed = await PriceFeed.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    USD = await ERC20Mock.new("USD", "USD", 18);
    uniswapV2Router = await UniswapV2RouterMock.new();

    await contractsRegistry.__ContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapV2Router.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), uniswapV2Router.address);

    priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

    await priceFeed.__PriceFeed_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());
  });

  describe("getPriceOut", () => {
    beforeEach("setup", async () => {
      await DEXE.mint(OWNER, wei(tokensToMint));
      await USD.mint(OWNER, wei(tokensToMint));

      await DEXE.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(DEXE.address, wei(reserveTokens));

      await USD.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(USD.address, wei(reserveTokens.idiv(2)));
    });

    it("should get correct direct price and path", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);

      const pricesInfo = await priceFeed.getExtendedPriceOut(DEXE.address, USD.address, wei("1000"), []);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("500"));
      assert.deepEqual(pricesInfo.path, [DEXE.address, USD.address]);
    });

    it("should get correct price with one extra token path", async () => {
      const MANA = await ERC20Mock.new("MANA", "MANA", 18);

      await MANA.mint(OWNER, wei(tokensToMint));

      await MANA.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(MANA.address, wei(reserveTokens));

      await uniswapV2Router.enablePair(DEXE.address, MANA.address);
      await uniswapV2Router.enablePair(MANA.address, USD.address);

      await priceFeed.setPathTokens([MANA.address]);

      const pricesInfo = await priceFeed.getExtendedPriceOut(DEXE.address, USD.address, wei("1000"), []);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("500"));
      assert.deepEqual(pricesInfo.path, [DEXE.address, MANA.address, USD.address]);
    });

    it("should get the best price", async () => {
      const MANA = await ERC20Mock.new("MANA", "MANA", 18);
      const WBTC = await ERC20Mock.new("WBTC", "WBTC", 8);

      await MANA.mint(OWNER, wei(tokensToMint));
      await WBTC.mint(OWNER, wei(tokensToMint, 8));

      await MANA.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(MANA.address, wei(reserveTokens));

      await WBTC.approve(uniswapV2Router.address, wei(reserveTokens, 8));
      await uniswapV2Router.setReserve(WBTC.address, wei(reserveTokens, 8));

      await uniswapV2Router.enablePair(DEXE.address, MANA.address);
      await uniswapV2Router.enablePair(MANA.address, USD.address);

      await uniswapV2Router.enablePair(DEXE.address, WBTC.address);
      await uniswapV2Router.enablePair(WBTC.address, USD.address);

      await uniswapV2Router.setBonuses(DEXE.address, MANA.address, wei("2000"));

      await priceFeed.setPathTokens([MANA.address, WBTC.address]);

      const pricesInfo = await priceFeed.getExtendedPriceOut(DEXE.address, USD.address, wei("2000"), []);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path, [DEXE.address, MANA.address, USD.address]);
    });

    it("should follow the provided path", async () => {
      const MANA = await ERC20Mock.new("MANA", "MANA", 18);
      const WBTC = await ERC20Mock.new("WBTC", "WBTC", 8);

      await MANA.mint(OWNER, wei(tokensToMint));
      await WBTC.mint(OWNER, wei(tokensToMint, 8));

      await MANA.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(MANA.address, wei(reserveTokens));

      await WBTC.approve(uniswapV2Router.address, wei(reserveTokens, 8));
      await uniswapV2Router.setReserve(WBTC.address, wei(reserveTokens, 8));

      await uniswapV2Router.enablePair(DEXE.address, MANA.address);
      await uniswapV2Router.enablePair(MANA.address, WBTC.address);
      await uniswapV2Router.enablePair(WBTC.address, USD.address);

      await priceFeed.setPathTokens([MANA.address, WBTC.address]);

      const pricesInfo = await priceFeed.getExtendedPriceOut(DEXE.address, USD.address, wei("500"), [
        DEXE.address,
        MANA.address,
        WBTC.address,
        USD.address,
      ]);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("250"));
      assert.deepEqual(pricesInfo.path, [DEXE.address, MANA.address, WBTC.address, USD.address]);
    });
  });

  describe("getPriceIn", () => {
    // TODO
  });

  describe("saved path", () => {
    let MANA;
    let WBTC;

    beforeEach("setup", async () => {
      MANA = await ERC20Mock.new("MANA", "MANA", 18);
      WBTC = await ERC20Mock.new("WBTC", "WBTC", 8);

      await DEXE.mint(OWNER, wei(tokensToMint));
      await USD.mint(OWNER, wei(tokensToMint));

      await MANA.mint(OWNER, wei(tokensToMint));
      await WBTC.mint(OWNER, wei(tokensToMint, 8));

      await DEXE.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(DEXE.address, wei(reserveTokens));

      await USD.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(USD.address, wei(reserveTokens.idiv(2)));

      await MANA.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(MANA.address, wei(reserveTokens));

      await WBTC.approve(uniswapV2Router.address, wei(reserveTokens, 8));
      await uniswapV2Router.setReserve(WBTC.address, wei(reserveTokens, 8));

      await uniswapV2Router.enablePair(DEXE.address, MANA.address);
      await uniswapV2Router.enablePair(MANA.address, WBTC.address);
      await uniswapV2Router.enablePair(WBTC.address, USD.address);

      await priceFeed.setPathTokens([MANA.address, WBTC.address]);
    });

    it("should save the path correctly", async () => {
      assert.deepEqual(await priceFeed.getSavedPaths(OWNER, DEXE.address, USD.address), []);

      let pricesInfo = await priceFeed.getNormalizedPriceOut(DEXE.address, USD.address, wei("500"));

      assert.equal(pricesInfo.amountOut.toFixed(), "0");

      await DEXE.approve(priceFeed.address, wei("1000"));

      await priceFeed.exchangeFromExact(
        DEXE.address,
        USD.address,
        wei("1000"),
        [DEXE.address, MANA.address, WBTC.address, USD.address],
        0
      );

      assert.deepEqual(await priceFeed.getSavedPaths(OWNER, DEXE.address, USD.address), [
        DEXE.address,
        MANA.address,
        WBTC.address,
        USD.address,
      ]);

      pricesInfo = await priceFeed.getNormalizedPriceOut(DEXE.address, USD.address, wei("500"));

      assert.closeTo(pricesInfo.amountOut.toNumber(), toBN(wei("250")).toNumber(), toBN(wei("1")).toNumber());
      assert.deepEqual(pricesInfo.path, [DEXE.address, MANA.address, WBTC.address, USD.address]);
    });

    it("should save the path correctly 2", async () => {
      await DEXE.approve(priceFeed.address, wei("3000"));

      await truffleAssert.reverts(
        priceFeed.exchangeFromExact(DEXE.address, USD.address, wei("1000"), [], 0),
        "PriceFeed: unreachable asset"
      );

      await priceFeed.exchangeFromExact(
        DEXE.address,
        USD.address,
        wei("1000"),
        [DEXE.address, MANA.address, WBTC.address, USD.address],
        0
      );

      await truffleAssert.passes(
        priceFeed.exchangeFromExact(DEXE.address, USD.address, wei("1000"), [], 0),
        "Assets is reachable"
      );

      assert.deepEqual(await priceFeed.getSavedPaths(OWNER, DEXE.address, USD.address), [
        DEXE.address,
        MANA.address,
        WBTC.address,
        USD.address,
      ]);
    });
  });
});
