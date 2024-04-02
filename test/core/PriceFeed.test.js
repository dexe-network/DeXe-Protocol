const { assert } = require("chai");
const { toBN, accounts, wei } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const PriceFeed = artifacts.require("PriceFeed");
const UniswapPathFinderLib = artifacts.require("UniswapPathFinder");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const UniswapV3QuoterMock = artifacts.require("UniswapV3QuoterMock");
const ERC20Mock = artifacts.require("ERC20Mock");
const SphereXEngineMock = artifacts.require("SphereXEngineMock");

ContractsRegistry.numberFormat = "BigNumber";
PriceFeed.numberFormat = "BigNumber";
UniswapV2RouterMock.numberFormat = "BigNumber";
UniswapV3QuoterMock.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

const SWAP_UNISWAP_V2 = "0";
const SWAP_UNISWAP_V3_FEE500 = "1";
const SWAP_UNISWAP_V3_FEE3000 = "2";
const SWAP_UNISWAP_V3_FEE10000 = "3";

describe("PriceFeed", () => {
  let tokensToMint = toBN(1000000000);
  let reserveTokens = toBN(1000000);

  let OWNER;
  let SECOND;

  let priceFeed;
  let uniswapV2Router;
  let uniswapV3Quoter;
  let DEXE;
  let USD;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);

    const uniswapPathFinderLib = await UniswapPathFinderLib.new();

    await PriceFeed.link(uniswapPathFinderLib);

    const contractsRegistry = await ContractsRegistry.new();
    const _priceFeed = await PriceFeed.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    USD = await ERC20Mock.new("USD", "USD", 18);
    uniswapV2Router = await UniswapV2RouterMock.new();
    uniswapV3Quoter = await UniswapV3QuoterMock.new();
    const _sphereXEngine = await SphereXEngineMock.new();

    await contractsRegistry.__MultiOwnableContractsRegistry_init();

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.SPHEREX_ENGINE_NAME(), _sphereXEngine.address);

    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);

    priceFeed = await PriceFeed.at(await contractsRegistry.getPriceFeedContract());

    defaultPoolTypes = [
      ["0", uniswapV2Router.address, "0"],
      ["1", uniswapV3Quoter.address, "500"],
      ["1", uniswapV3Quoter.address, "3000"],
      ["1", uniswapV3Quoter.address, "10000"],
    ];

    await priceFeed.__PriceFeed_init(defaultPoolTypes);

    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("access", () => {
    it("should not initialize twice", async () => {
      await truffleAssert.reverts(
        priceFeed.__PriceFeed_init(defaultPoolTypes),
        "Initializable: contract is already initialized",
      );
    });

    it("should not set dependencies from non dependant", async () => {
      await truffleAssert.reverts(priceFeed.setDependencies(OWNER, "0x"), "Dependant: not an injector");
    });

    it("only owner should call these methods", async () => {
      await truffleAssert.reverts(
        priceFeed.addPathTokens([USD.address], { from: SECOND }),
        "MultiOwnable: caller is not the owner",
      );

      await truffleAssert.reverts(
        priceFeed.removePathTokens([USD.address], { from: SECOND }),
        "MultiOwnable: caller is not the owner",
      );

      await truffleAssert.reverts(
        priceFeed.setPoolTypes(defaultPoolTypes, { from: SECOND }),
        "Ownable: caller is not the owner",
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

  describe("pool types", () => {
    it("initializes pool types properly", async () => {
      assert.deepEqual(await priceFeed.getPoolTypes(), defaultPoolTypes);
    });

    it("could set new pool types", async () => {
      const newPoolTypes = [["1", uniswapV3Quoter.address, "100"]];
      await priceFeed.setPoolTypes(newPoolTypes);
      assert.deepEqual(await priceFeed.getPoolTypes(), newPoolTypes);
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

      const pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, 0, [[], []]);

      assert.equal(pricesInfo.amountOut.toFixed(), "0");
      assert.deepEqual(pricesInfo.path, [[], []]);
    });

    it("should get the same price", async () => {
      const pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, DEXE.address, wei("1"), [[], []]);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("1"));
      assert.deepEqual(pricesInfo.path, [[], []]);
    });

    it("should get correct direct price and path", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);

      const pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [[], []]);
      const rawPricesInfo = await priceFeed.getPriceOut.call(DEXE.address, USD.address, wei("1000"));
      const usdPricesInfo = await priceFeed.getNormalizedPriceOutUSD.call(DEXE.address, wei("1000"));
      const dexePricesInfo = await priceFeed.getNormalizedPriceOutDEXE.call(USD.address, wei("250"));
      const normPricesInfo = await priceFeed.getNormalizedExtendedPriceOut.call(
        DEXE.address,
        USD.address,
        wei("1000"),
        [[], []],
      );

      assert.equal(pricesInfo.amountOut.toFixed(), normPricesInfo.amountOut.toFixed());
      assert.equal(pricesInfo.amountOut.toFixed(), rawPricesInfo.amountOut.toFixed());
      assert.equal(pricesInfo.amountOut.toFixed(), usdPricesInfo.amountOut.toFixed());
      assert.equal(pricesInfo.amountOut.toFixed(), dexePricesInfo.amountOut.toFixed());
      assert.equal(pricesInfo.amountOut.toFixed(), wei("500"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2]);
    });

    it("should get correct price with one extra token path", async () => {
      const MANA = await ERC20Mock.new("MANA", "MANA", 18);

      await MANA.mint(OWNER, wei(tokensToMint));

      await MANA.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(MANA.address, wei(reserveTokens));

      await uniswapV2Router.enablePair(DEXE.address, MANA.address);
      await uniswapV2Router.enablePair(MANA.address, USD.address);

      await priceFeed.addPathTokens([MANA.address]);

      const pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [[], []]);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("500"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, MANA.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2, SWAP_UNISWAP_V2]);
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

      const pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("2000"), [[], []]);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, MANA.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2, SWAP_UNISWAP_V2]);
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

      const bestPath = [
        [DEXE.address, MANA.address, WBTC.address, USD.address],
        [SWAP_UNISWAP_V2, SWAP_UNISWAP_V2, SWAP_UNISWAP_V2],
      ];

      const pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("500"), bestPath);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("250"));
      assert.deepEqual(pricesInfo.path.path, bestPath[0]);
      assert.deepEqual(pricesInfo.path.poolTypes, bestPath[1]);
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

      const pricesInfo = await priceFeed.getExtendedPriceIn.call(DEXE.address, USD.address, 0, [[], []]);

      assert.equal(pricesInfo.amountIn.toFixed(), "0");
      assert.deepEqual(pricesInfo.path, [[], []]);
    });

    it("should get the same price", async () => {
      const pricesInfo = await priceFeed.getExtendedPriceIn.call(DEXE.address, DEXE.address, wei("1"), [[], []]);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("1"));
      assert.deepEqual(pricesInfo.path, [[], []]);
    });

    it("should get direct price and path", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);

      const pricesInfo = await priceFeed.getExtendedPriceIn.call(DEXE.address, USD.address, wei("500"), [[], []]);
      const rawPricesInfo = await priceFeed.getPriceIn.call(DEXE.address, USD.address, wei("500"));
      const usdPriceInfo = await priceFeed.getNormalizedPriceInUSD.call(DEXE.address, wei("500"));
      const dexePriceInfo = await priceFeed.getNormalizedPriceInDEXE.call(USD.address, wei("2000"));
      const normPricesInfo = await priceFeed.getNormalizedExtendedPriceIn.call(DEXE.address, USD.address, wei("500"), [
        [],
        [],
      ]);

      assert.equal(pricesInfo.amountIn.toFixed(), normPricesInfo.amountIn.toFixed());
      assert.equal(pricesInfo.amountIn.toFixed(), rawPricesInfo.amountIn.toFixed());
      assert.equal(pricesInfo.amountIn.toFixed(), usdPriceInfo.amountIn.toFixed());
      assert.equal(pricesInfo.amountIn.toFixed(), dexePriceInfo.amountIn.toFixed());
      assert.equal(pricesInfo.amountIn.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2]);
    });

    it("should get correct price and path with one extra token", async () => {
      const MANA = await ERC20Mock.new("MANA", "MANA", 18);

      await MANA.mint(OWNER, wei(tokensToMint));

      await MANA.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(MANA.address, wei(reserveTokens));

      await uniswapV2Router.enablePair(DEXE.address, MANA.address);
      await uniswapV2Router.enablePair(MANA.address, USD.address);

      await priceFeed.addPathTokens([MANA.address]);

      const pricesInfo = await priceFeed.getExtendedPriceIn.call(DEXE.address, USD.address, wei("500"), [[], []]);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, MANA.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2, SWAP_UNISWAP_V2]);
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

      const pricesInfo = await priceFeed.getExtendedPriceIn.call(DEXE.address, USD.address, wei("2000"), [[], []]);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, MANA.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2, SWAP_UNISWAP_V2]);
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

      const bestPath = [
        [DEXE.address, MANA.address, USD.address],
        [SWAP_UNISWAP_V2, SWAP_UNISWAP_V2],
      ];

      const pricesInfo = await priceFeed.getExtendedPriceIn.call(DEXE.address, USD.address, wei("2000"), bestPath);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path.path, bestPath[0]);
      assert.deepEqual(pricesInfo.path.poolTypes, bestPath[1]);
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

      const pricesInfo = await priceFeed.getExtendedPriceIn.call(DEXE.address, USD.address, wei("2000"), [
        [DEXE.address, WBTC.address, USD.address],
        [SWAP_UNISWAP_V2, SWAP_UNISWAP_V2],
      ]);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, MANA.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2, SWAP_UNISWAP_V2]);
    });
  });

  describe("uniswap v3", () => {
    beforeEach("setup", async () => {
      await DEXE.mint(OWNER, wei(tokensToMint));
      await USD.mint(OWNER, wei(tokensToMint));

      await DEXE.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(DEXE.address, wei(reserveTokens));

      await USD.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(USD.address, wei(reserveTokens));
    });

    async function setPoolInfo(token0, reserve0, token1, reserve1, fee) {
      if (token0.address.toLowerCase() > token1.address.toLowerCase()) {
        [token0, token1, reserve0, reserve1] = [token1, token0, reserve1, reserve0];
      }
      await uniswapV3Quoter.setPoolInfo(token0.address, token1.address, fee, [reserve0, reserve1]);
    }

    it("could find swap with v3", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);

      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens.times(2)), 500);

      let pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [[], []]);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V3_FEE500]);

      pricesInfo = await priceFeed.getExtendedPriceOut.call(USD.address, DEXE.address, wei("1000"), [[], []]);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [USD.address, DEXE.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2]);
    });

    it("finds swap with best price for priceOut", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);

      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens.times(2)), 500);
      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens), 3000);
      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens), 10000);

      let pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [[], []]);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V3_FEE500]);

      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens), 500);
      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens.times(2)), 3000);

      pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [[], []]);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V3_FEE3000]);

      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens), 3000);
      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens.times(2)), 10000);

      pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [[], []]);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("2000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V3_FEE10000]);
    });

    it("finds swap with best price for priceIn", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);

      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens.times(2)), 500);
      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens), 3000);
      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens), 10000);

      let pricesInfo = await priceFeed.getExtendedPriceIn.call(DEXE.address, USD.address, wei("2000"), [[], []]);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V3_FEE500]);

      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens), 500);
      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens.times(2)), 3000);

      pricesInfo = await priceFeed.getExtendedPriceIn.call(DEXE.address, USD.address, wei("2000"), [[], []]);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V3_FEE3000]);

      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens), 3000);
      await setPoolInfo(DEXE, wei(reserveTokens), USD, wei(reserveTokens.times(2)), 10000);

      pricesInfo = await priceFeed.getExtendedPriceIn.call(DEXE.address, USD.address, wei("2000"), [[], []]);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V3_FEE10000]);
    });

    it("returns zero if path for priceIn not exist", async () => {
      const MANA = await ERC20Mock.new("MANA", "MANA", 18);
      const WBTC = await ERC20Mock.new("WBTC", "WBTC", 18);

      let pricesInfo = await priceFeed.getExtendedPriceIn.call(MANA.address, WBTC.address, wei("1000"), [[], []]);
      assert.equal(pricesInfo.amountIn.toFixed(), 0);
      assert.deepEqual(pricesInfo.path, [[], []]);
    });

    it("properly handles proper path but no pools alongside it", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);

      const MANA = await ERC20Mock.new("MANA", "MANA", 18);

      let pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [
        [DEXE.address, MANA.address, USD.address],
        [SWAP_UNISWAP_V3_FEE500, SWAP_UNISWAP_V3_FEE500],
      ]);

      assert.equal(pricesInfo.amountOut.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2]);

      pricesInfo = await priceFeed.getExtendedPriceIn.call(DEXE.address, USD.address, wei("1000"), [
        [DEXE.address, MANA.address, USD.address],
        [SWAP_UNISWAP_V3_FEE500, SWAP_UNISWAP_V3_FEE500],
      ]);

      assert.equal(pricesInfo.amountIn.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2]);
    });

    it("ignores incorrect path", async () => {
      await uniswapV2Router.enablePair(DEXE.address, USD.address);
      const MANA = await ERC20Mock.new("MANA", "MANA", 18);
      await setPoolInfo(DEXE, wei(reserveTokens), MANA, wei(reserveTokens.times(2)), 500);
      await setPoolInfo(MANA, wei(reserveTokens), USD, wei(reserveTokens.times(2)), 500);

      let pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [
        [DEXE.address, MANA.address, USD.address],
        [SWAP_UNISWAP_V3_FEE500],
      ]);
      assert.equal(pricesInfo.amountOut.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2]);

      pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [
        [USD.address, MANA.address, USD.address],
        [SWAP_UNISWAP_V3_FEE500, SWAP_UNISWAP_V3_FEE500],
      ]);
      assert.equal(pricesInfo.amountOut.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2]);

      pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [
        [DEXE.address, MANA.address, DEXE.address],
        [SWAP_UNISWAP_V3_FEE500, SWAP_UNISWAP_V3_FEE500],
      ]);
      assert.equal(pricesInfo.amountOut.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2]);

      pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [
        [DEXE.address, MANA.address, USD.address],
        [70, SWAP_UNISWAP_V3_FEE500],
      ]);
      assert.equal(pricesInfo.amountOut.toFixed(), wei("1000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2]);

      pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("1000"), [
        [DEXE.address, MANA.address, USD.address],
        [SWAP_UNISWAP_V3_FEE500, SWAP_UNISWAP_V3_FEE500],
      ]);
      assert.equal(pricesInfo.amountOut.toFixed(), wei("4000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, MANA.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V3_FEE500, SWAP_UNISWAP_V3_FEE500]);
    });

    it("finds best path with intermediate tokens", async () => {
      const MANA = await ERC20Mock.new("MANA", "MANA", 18);
      const WBTC = await ERC20Mock.new("WBTC", "WBTC", 18);

      await MANA.mint(OWNER, wei(tokensToMint));
      await WBTC.mint(OWNER, wei(tokensToMint));

      await MANA.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(MANA.address, wei(reserveTokens));

      await WBTC.approve(uniswapV2Router.address, wei(reserveTokens));
      await uniswapV2Router.setReserve(WBTC.address, wei(reserveTokens));

      await uniswapV2Router.enablePair(DEXE.address, MANA.address);
      await uniswapV2Router.enablePair(MANA.address, USD.address);

      await uniswapV2Router.enablePair(DEXE.address, WBTC.address);
      await uniswapV2Router.enablePair(WBTC.address, USD.address);

      await setPoolInfo(DEXE, wei(reserveTokens), MANA, wei(reserveTokens.times(2)), 3000);
      await setPoolInfo(MANA, wei(reserveTokens), USD, wei(reserveTokens.idiv(4)), 3000);

      await setPoolInfo(DEXE, wei(reserveTokens), WBTC, wei(reserveTokens.idiv(2)), 3000);
      await setPoolInfo(WBTC, wei(reserveTokens), USD, wei(reserveTokens.times(4)), 3000);

      await priceFeed.addPathTokens([MANA.address, WBTC.address]);

      let pricesInfo = await priceFeed.getExtendedPriceOut.call(DEXE.address, USD.address, wei("2000"), [[], []]);
      assert.equal(pricesInfo.amountOut.toFixed(), wei("8000"));
      assert.deepEqual(pricesInfo.path.path, [DEXE.address, WBTC.address, USD.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V2, SWAP_UNISWAP_V3_FEE3000]);

      pricesInfo = await priceFeed.getExtendedPriceIn.call(USD.address, DEXE.address, wei("2000"), [[], []]);
      assert.equal(pricesInfo.amountIn.toFixed(), wei("500"));
      assert.deepEqual(pricesInfo.path.path, [USD.address, MANA.address, DEXE.address]);
      assert.deepEqual(pricesInfo.path.poolTypes, [SWAP_UNISWAP_V3_FEE3000, SWAP_UNISWAP_V2]);
    });
  });
});
