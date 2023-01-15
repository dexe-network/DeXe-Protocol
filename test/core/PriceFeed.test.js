const { assert } = require("chai");
const { toBN, accounts, wei } = require("../../scripts/utils/utils");
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

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapV2Router.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), uniswapV2Router.address);

    priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

    await priceFeed.__PriceFeed_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());
  });

  describe("access", () => {
    it("should not initialize twice", async () => {
      await truffleAssert.reverts(priceFeed.__PriceFeed_init(), "Initializable: contract is already initialized");
    });

    it("should not set dependencies from non dependant", async () => {
      await truffleAssert.reverts(priceFeed.setDependencies(OWNER), "Dependant: Not an injector");
    });

    it("only owner should call these methods", async () => {
      await truffleAssert.reverts(
        priceFeed.addPathTokens([USD.address], { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(
        priceFeed.removePathTokens([USD.address], { from: SECOND }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("path tokens", () => {
    it("should set and return path tokens", async () => {
      await priceFeed.addPathTokens([USD.address, DEXE.address, USD.address]);

      assert.isTrue(await priceFeed.isSupportedPathToken(USD.address));
      assert.isFalse(await priceFeed.isSupportedPathToken(SECOND));

      assert.equal((await priceFeed.totalPathTokens()).toFixed(), "2");
      assert.deepEqual(await priceFeed.getPathTokens(), [USD.address, DEXE.address]);
    });

    it("should set and remove path tokens", async () => {
      await priceFeed.addPathTokens([USD.address, DEXE.address]);
      await priceFeed.removePathTokens([USD.address]);

      assert.equal((await priceFeed.totalPathTokens()).toFixed(), "1");
      assert.deepEqual(await priceFeed.getPathTokens(), [DEXE.address]);
    });
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

    it("should get zero price", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);

      const pricesInfo = await priceFeed.getExtendedPriceOut(DEXE.address, USD.address, 0, []);

      assert.equal(pricesInfo.amountOut.toFixed(), "0");
      assert.deepEqual(pricesInfo.path, []);
    });

    it("should get the same price", async () => {
      const pricesInfo = await priceFeed.getExtendedPriceOut(DEXE.address, DEXE.address, wei("1"), []);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("1"));
      assert.deepEqual(pricesInfo.path, []);
    });

    it("should get correct direct price and path", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);

      const pricesInfo = await priceFeed.getExtendedPriceOut(DEXE.address, USD.address, wei("1000"), []);
      const usdPricesInfo = await priceFeed.getNormalizedPriceOutUSD(DEXE.address, wei("1000"));
      const dexePricesInfo = await priceFeed.getNormalizedPriceOutDEXE(USD.address, wei("250"));
      const normPricesInfo = await priceFeed.getNormalizedExtendedPriceOut(DEXE.address, USD.address, wei("1000"), []);

      assert.equal(pricesInfo.amountOut.toFixed(), normPricesInfo.amountOut.toFixed());
      assert.equal(pricesInfo.amountOut.toFixed(), usdPricesInfo.amountOut.toFixed());
      assert.equal(pricesInfo.amountOut.toFixed(), dexePricesInfo.amountOut.toFixed());
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

      await priceFeed.addPathTokens([MANA.address]);

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

      await priceFeed.addPathTokens([MANA.address, WBTC.address]);

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

      await priceFeed.addPathTokens([MANA.address, WBTC.address]);

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
    beforeEach("setup", async () => {
      await DEXE.mint(OWNER, wei(tokensToMint));
      await USD.mint(OWNER, wei(tokensToMint));

      await DEXE.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(DEXE.address, wei(reserveTokens));

      await USD.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(USD.address, wei(reserveTokens.idiv(2)));
    });

    it("should get zero price", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);

      const pricesInfo = await priceFeed.getExtendedPriceIn(DEXE.address, USD.address, 0, []);

      assert.equal(pricesInfo.amountIn.toFixed(), "0");
      assert.deepEqual(pricesInfo.path, []);
    });

    it("should get the same price", async () => {
      const pricesInfo = await priceFeed.getExtendedPriceIn(DEXE.address, DEXE.address, wei("1"), []);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("1"));
      assert.deepEqual(pricesInfo.path, []);
    });

    it("should get direct price and path", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);

      const pricesInfo = await priceFeed.getExtendedPriceIn(DEXE.address, USD.address, wei("500"), []);
      const usdPriceInfo = await priceFeed.getNormalizedPriceInUSD(DEXE.address, wei("500"));
      const dexePriceInfo = await priceFeed.getNormalizedPriceInDEXE(USD.address, wei("2000"));
      const normPricesInfo = await priceFeed.getNormalizedExtendedPriceIn(DEXE.address, USD.address, wei("500"), []);

      assert.equal(pricesInfo.amountIn.toFixed(), normPricesInfo.amountIn.toFixed());
      assert.equal(pricesInfo.amountIn.toFixed(), usdPriceInfo.amountIn.toFixed());
      assert.equal(pricesInfo.amountIn.toFixed(), dexePriceInfo.amountIn.toFixed());
      assert.equal(pricesInfo.amountIn.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path, [DEXE.address, USD.address]);
    });

    it("should get correct price and path with one extra token", async () => {
      const MANA = await ERC20Mock.new("MANA", "MANA", 18);

      await MANA.mint(OWNER, wei(tokensToMint));

      await MANA.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(MANA.address, wei(reserveTokens));

      await uniswapV2Router.enablePair(DEXE.address, MANA.address);
      await uniswapV2Router.enablePair(MANA.address, USD.address);

      await priceFeed.addPathTokens([MANA.address]);

      const pricesInfo = await priceFeed.getExtendedPriceIn(DEXE.address, USD.address, wei("500"), []);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("1000"));
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

      await uniswapV2Router.setBonuses(MANA.address, DEXE.address, wei("2000"));

      await priceFeed.addPathTokens([WBTC.address, MANA.address]);

      const pricesInfo = await priceFeed.getExtendedPriceIn(DEXE.address, USD.address, wei("2000"), []);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path, [DEXE.address, MANA.address, USD.address]);
    });

    it("should get the best price from provided path", async () => {
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

      await uniswapV2Router.setBonuses(MANA.address, DEXE.address, wei("2000"));

      await priceFeed.addPathTokens([WBTC.address]);

      const pricesInfo = await priceFeed.getExtendedPriceIn(DEXE.address, USD.address, wei("2000"), [
        DEXE.address,
        MANA.address,
        USD.address,
      ]);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path, [DEXE.address, MANA.address, USD.address]);
    });

    it("should stick to the best price", async () => {
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

      await uniswapV2Router.setBonuses(MANA.address, DEXE.address, wei("2000"));

      await priceFeed.addPathTokens([MANA.address]);

      const pricesInfo = await priceFeed.getExtendedPriceIn(DEXE.address, USD.address, wei("2000"), [
        DEXE.address,
        WBTC.address,
        USD.address,
      ]);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path, [DEXE.address, MANA.address, USD.address]);
    });
  });

  describe("exchange, normalized exchange", () => {
    let WBTC;

    beforeEach("setup", async () => {
      const MANA = await ERC20Mock.new("MANA", "MANA", 18);
      WBTC = await ERC20Mock.new("WBTC", "WBTC", 8);

      await DEXE.mint(OWNER, wei(tokensToMint));

      await MANA.mint(OWNER, wei(tokensToMint));
      await WBTC.mint(OWNER, wei(tokensToMint, 8));

      await DEXE.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(DEXE.address, wei(reserveTokens));

      await MANA.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(MANA.address, wei(reserveTokens));

      await WBTC.approve(uniswapV2Router.address, wei(reserveTokens, 8));
      await uniswapV2Router.setReserve(WBTC.address, wei(reserveTokens, 8));

      await uniswapV2Router.enablePair(DEXE.address, MANA.address);
      await uniswapV2Router.enablePair(MANA.address, WBTC.address);

      await priceFeed.addPathTokens([MANA.address]);
    });

    it("should exchange from tokens", async () => {
      assert.equal(toBN(await DEXE.balanceOf(OWNER)).toFixed(), wei("999000000"));
      assert.equal(toBN(await WBTC.balanceOf(OWNER)).toFixed(), wei("999000000", 8));

      await DEXE.approve(priceFeed.address, wei("1000"));

      await priceFeed.exchangeFromExact(DEXE.address, WBTC.address, wei("1000"), [], 0);

      assert.equal(toBN(await DEXE.balanceOf(OWNER)).toFixed(), wei("998999000"));
      assert.equal(toBN(await WBTC.balanceOf(OWNER)).toFixed(), wei("999001000", 8));
    });

    it("should exchange to tokens", async () => {
      assert.equal(toBN(await DEXE.balanceOf(OWNER)).toFixed(), wei("999000000"));
      assert.equal(toBN(await WBTC.balanceOf(OWNER)).toFixed(), wei("999000000", 8));

      await DEXE.approve(priceFeed.address, wei("1000"));

      await priceFeed.exchangeToExact(DEXE.address, WBTC.address, wei("1000", 8), [], wei("1000"));

      assert.equal(toBN(await DEXE.balanceOf(OWNER)).toFixed(), wei("998999000"));
      assert.equal(toBN(await WBTC.balanceOf(OWNER)).toFixed(), wei("999001000", 8));
    });

    it("should exchange norm from tokens", async () => {
      assert.equal(toBN(await DEXE.balanceOf(OWNER)).toFixed(), wei("999000000"));
      assert.equal(toBN(await WBTC.balanceOf(OWNER)).toFixed(), wei("999000000", 8));

      await WBTC.approve(priceFeed.address, wei("1000", 8));

      await priceFeed.normalizedExchangeFromExact(WBTC.address, DEXE.address, wei("1000"), [], 0);

      assert.equal(toBN(await DEXE.balanceOf(OWNER)).toFixed(), wei("999001000"));
      assert.equal(toBN(await WBTC.balanceOf(OWNER)).toFixed(), wei("998999000", 8));
    });

    it("should exchange norm to tokens", async () => {
      assert.equal(toBN(await DEXE.balanceOf(OWNER)).toFixed(), wei("999000000"));
      assert.equal(toBN(await WBTC.balanceOf(OWNER)).toFixed(), wei("999000000", 8));

      await WBTC.approve(priceFeed.address, wei("1000", 8));

      await priceFeed.normalizedExchangeToExact(WBTC.address, DEXE.address, wei("1000"), [], wei("1000"));

      assert.equal(toBN(await DEXE.balanceOf(OWNER)).toFixed(), wei("999001000"));
      assert.equal(toBN(await WBTC.balanceOf(OWNER)).toFixed(), wei("998999000", 8));
    });

    it("should not exchange from tokens", async () => {
      assert.equal(toBN(await DEXE.balanceOf(OWNER)).toFixed(), wei("999000000"));

      await DEXE.approve(priceFeed.address, wei("1000"));

      await priceFeed.exchangeFromExact(DEXE.address, WBTC.address, 0, [], 0);
      await priceFeed.exchangeFromExact(DEXE.address, DEXE.address, wei("1000"), [], 0);

      assert.equal(toBN(await DEXE.balanceOf(OWNER)).toFixed(), wei("999000000"));
    });

    it("should not exchange to tokens", async () => {
      assert.equal(toBN(await WBTC.balanceOf(OWNER)).toFixed(), wei("999000000", 8));

      await DEXE.approve(priceFeed.address, wei("1000"));

      await priceFeed.exchangeToExact(DEXE.address, WBTC.address, 0, [], 0);
      await priceFeed.exchangeToExact(WBTC.address, WBTC.address, wei("1000", 8), [], wei("1000", 8));

      assert.equal(toBN(await WBTC.balanceOf(OWNER)).toFixed(), wei("999000000", 8));
    });
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

      await priceFeed.addPathTokens([MANA.address, WBTC.address]);
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

      assert.deepEqual(await priceFeed.getSavedPaths(OWNER, USD.address, DEXE.address), [
        USD.address,
        WBTC.address,
        MANA.address,
        DEXE.address,
      ]);

      pricesInfo = await priceFeed.getNormalizedPriceOut(DEXE.address, USD.address, wei("500"));

      assert.closeTo(pricesInfo.amountOut.toNumber(), toBN(wei("250")).toNumber(), toBN(wei("1")).toNumber());
      assert.deepEqual(pricesInfo.path, [DEXE.address, MANA.address, WBTC.address, USD.address]);
    });

    it("should reuse the saved path", async () => {
      await DEXE.approve(priceFeed.address, wei("3000"));
      await USD.approve(priceFeed.address, wei("1000"));

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
        priceFeed.exchangeToExact(USD.address, DEXE.address, wei("500"), [], wei("1000")),
        "Assets is reachable"
      );

      assert.deepEqual(await priceFeed.getSavedPaths(OWNER, DEXE.address, USD.address), [
        DEXE.address,
        MANA.address,
        WBTC.address,
        USD.address,
      ]);

      assert.deepEqual(await priceFeed.getSavedPaths(OWNER, USD.address, DEXE.address), [
        USD.address,
        WBTC.address,
        MANA.address,
        DEXE.address,
      ]);
    });

    it("should save the path correctly 2", async () => {
      assert.deepEqual(await priceFeed.getSavedPaths(OWNER, DEXE.address, USD.address), []);

      let pricesInfo = await priceFeed.getNormalizedPriceIn(DEXE.address, USD.address, wei("1000"));

      assert.equal(pricesInfo.amountIn.toFixed(), "0");

      await DEXE.approve(priceFeed.address, wei("1000"));

      await priceFeed.exchangeToExact(
        DEXE.address,
        USD.address,
        wei("500"),
        [DEXE.address, MANA.address, WBTC.address, USD.address],
        wei("1000")
      );

      assert.deepEqual(await priceFeed.getSavedPaths(OWNER, DEXE.address, USD.address), [
        DEXE.address,
        MANA.address,
        WBTC.address,
        USD.address,
      ]);

      assert.deepEqual(await priceFeed.getSavedPaths(OWNER, USD.address, DEXE.address), [
        USD.address,
        WBTC.address,
        MANA.address,
        DEXE.address,
      ]);

      pricesInfo = await priceFeed.getNormalizedPriceIn(DEXE.address, USD.address, wei("500"));

      assert.closeTo(pricesInfo.amountIn.toNumber(), toBN(wei("1000")).toNumber(), toBN(wei("10")).toNumber());
      assert.deepEqual(pricesInfo.path, [DEXE.address, MANA.address, WBTC.address, USD.address]);
    });

    it("should reuse the saved path 2", async () => {
      await DEXE.approve(priceFeed.address, wei("3000"));
      await USD.approve(priceFeed.address, wei("1000"));

      await truffleAssert.reverts(
        priceFeed.exchangeToExact(DEXE.address, USD.address, wei("500"), [], 0),
        "PriceFeed: unreachable asset"
      );

      await priceFeed.exchangeToExact(
        DEXE.address,
        USD.address,
        wei("500"),
        [DEXE.address, MANA.address, WBTC.address, USD.address],
        wei("1000")
      );

      await truffleAssert.passes(
        priceFeed.exchangeFromExact(USD.address, DEXE.address, wei("500"), [], 0),
        "Assets is reachable"
      );

      assert.deepEqual(await priceFeed.getSavedPaths(OWNER, DEXE.address, USD.address), [
        DEXE.address,
        MANA.address,
        WBTC.address,
        USD.address,
      ]);

      assert.deepEqual(await priceFeed.getSavedPaths(OWNER, USD.address, DEXE.address), [
        USD.address,
        WBTC.address,
        MANA.address,
        DEXE.address,
      ]);
    });
  });
});
