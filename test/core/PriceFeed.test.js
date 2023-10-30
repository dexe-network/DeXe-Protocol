const { assert } = require("chai");
const { toBN, accounts, wei } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PriceFeed = artifacts.require("PriceFeed");
const UniswapV2PathFinderLib = artifacts.require("UniswapV2PathFinder");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const ERC20Mock = artifacts.require("ERC20Mock");
const SphereXEngineMock = artifacts.require("SphereXEngineMock");

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

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);

    const uniswapV2PathFinderLib = await UniswapV2PathFinderLib.new();

    await PriceFeed.link(uniswapV2PathFinderLib);

    const contractsRegistry = await ContractsRegistry.new();
    const _priceFeed = await PriceFeed.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    USD = await ERC20Mock.new("USD", "USD", 18);
    uniswapV2Router = await UniswapV2RouterMock.new();
    const _sphereXEngine = await SphereXEngineMock.new();

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addContract(await contractsRegistry.SPHEREX_ENGINE_NAME(), _sphereXEngine.address);

    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapV2Router.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), uniswapV2Router.address);

    priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

    await priceFeed.__PriceFeed_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("access", () => {
    it("should not initialize twice", async () => {
      await truffleAssert.reverts(priceFeed.__PriceFeed_init(), "Initializable: contract is already initialized");
    });

    it("should not set dependencies from non dependant", async () => {
      await truffleAssert.reverts(priceFeed.setDependencies(OWNER, "0x"), "Dependant: not an injector");
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
      const rawPricesInfo = await priceFeed.getPriceOut(DEXE.address, USD.address, wei("1000"));
      const usdPricesInfo = await priceFeed.getNormalizedPriceOutUSD(DEXE.address, wei("1000"));
      const dexePricesInfo = await priceFeed.getNormalizedPriceOutDEXE(USD.address, wei("250"));
      const normPricesInfo = await priceFeed.getNormalizedExtendedPriceOut(DEXE.address, USD.address, wei("1000"), []);

      assert.equal(pricesInfo.amountOut.toFixed(), normPricesInfo.amountOut.toFixed());
      assert.equal(pricesInfo.amountOut.toFixed(), rawPricesInfo.amountOut.toFixed());
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
      const rawPricesInfo = await priceFeed.getPriceIn(DEXE.address, USD.address, wei("500"));
      const usdPriceInfo = await priceFeed.getNormalizedPriceInUSD(DEXE.address, wei("500"));
      const dexePriceInfo = await priceFeed.getNormalizedPriceInDEXE(USD.address, wei("2000"));
      const normPricesInfo = await priceFeed.getNormalizedExtendedPriceIn(DEXE.address, USD.address, wei("500"), []);

      assert.equal(pricesInfo.amountIn.toFixed(), normPricesInfo.amountIn.toFixed());
      assert.equal(pricesInfo.amountIn.toFixed(), rawPricesInfo.amountIn.toFixed());
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
});
