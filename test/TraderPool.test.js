const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const { setTime, getCurrentBlockTime } = require("./helpers/hardhatTimeTraveller");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const Insurance = artifacts.require("Insurance");
const ERC20Mock = artifacts.require("ERC20Mock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeedMock = artifacts.require("PriceFeedMock");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");
const TraderPoolMock = artifacts.require("TraderPoolMock");
const TraderPoolCommissionLib = artifacts.require("TraderPoolCommission");
const TraderPoolLeverageLib = artifacts.require("TraderPoolLeverage");
const TraderPoolPriceLib = artifacts.require("TraderPoolPrice");
const TraderPoolViewLib = artifacts.require("TraderPoolView");

ContractsRegistry.numberFormat = "BigNumber";
Insurance.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeedMock.numberFormat = "BigNumber";
UniswapV2RouterMock.numberFormat = "BigNumber";
TraderPoolRegistry.numberFormat = "BigNumber";
TraderPoolMock.numberFormat = "BigNumber";

const SECONDS_IN_DAY = 86400;
const SECONDS_IN_MONTH = SECONDS_IN_DAY * 30;
const PRECISION = toBN(10).pow(25);
const DECIMAL = toBN(10).pow(18);

const ComissionPeriods = {
  PERIOD_1: 0,
  PERIOD_2: 1,
  PERIOD_3: 2,
};

const DEFAULT_CORE_PROPERTIES = {
  maxPoolInvestors: 1000,
  maxOpenPositions: 25,
  leverageThreshold: 2500,
  leverageSlope: 5,
  commissionInitTimestamp: 0,
  commissionDurations: [SECONDS_IN_MONTH, SECONDS_IN_MONTH * 3, SECONDS_IN_MONTH * 12],
  dexeCommissionPercentage: PRECISION.times(30).toFixed(),
  dexeCommissionDistributionPercentages: [
    PRECISION.times(33).toFixed(),
    PRECISION.times(33).toFixed(),
    PRECISION.times(33).toFixed(),
  ],
  minTraderCommission: PRECISION.times(20).toFixed(),
  maxTraderCommissions: [PRECISION.times(30).toFixed(), PRECISION.times(50).toFixed(), PRECISION.times(70).toFixed()],
  delayForRiskyPool: SECONDS_IN_DAY * 20,
  insuranceFactor: 10,
  maxInsurancePoolShare: 3,
  minInsuranceDeposit: DECIMAL.times(10).toFixed(),
};

describe("TraderPool", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let FACTORY;
  let NOTHING;

  let insurance;
  let DEXE;
  let USD;
  let coreProperties;
  let priceFeed;
  let uniswapV2Router;
  let traderPoolRegistry;
  let tokens = {};

  let traderPool;

  async function configureBaseTokens() {
    let tokensToMint = toBN(1000000000);
    let reserveTokens = toBN(1000000);

    let tokenNames = ["USD", "DEXE", "WETH", "USDT", "MANA", "WBTC"];
    let decimals = [18, 18, 18, 6, 18, 8];

    for (let i = 0; i < tokenNames.length; i++) {
      if (tokenNames[i] == "USD") {
        tokens[tokenNames[i]] = USD;
      } else if (tokenNames[i] == "DEXE") {
        tokens[tokenNames[i]] = DEXE;
      } else {
        tokens[tokenNames[i]] = await ERC20Mock.new(tokenNames[i], tokenNames[i], decimals[i]);
      }

      let decimalWei = toBN(10).pow(decimals[i]);

      await tokens[tokenNames[i]].mint(OWNER, tokensToMint.times(decimalWei));

      await priceFeed.addSupportedBaseTokens([tokens[tokenNames[i]].address]);

      await tokens[tokenNames[i]].approve(uniswapV2Router.address, reserveTokens.times(decimalWei));
      await uniswapV2Router.setReserve(tokens[tokenNames[i]].address, reserveTokens.times(decimalWei));
    }

    for (let i = 0; i < tokenNames.length; i++) {
      for (let j = i + 1; j < tokenNames.length; j++) {
        await uniswapV2Router.enablePair(tokens[tokenNames[i]].address, tokens[tokenNames[j]].address);
      }
    }
  }

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    FACTORY = await accounts(3);
    NOTHING = await accounts(9);

    const traderPoolPriceLib = await TraderPoolPriceLib.new();

    await TraderPoolLeverageLib.link(traderPoolPriceLib);

    const traderPoolCommissionLib = await TraderPoolCommissionLib.new();
    const traderPoolLeverageLib = await TraderPoolLeverageLib.new();

    await TraderPoolViewLib.link(traderPoolPriceLib);
    await TraderPoolViewLib.link(traderPoolCommissionLib);
    await TraderPoolViewLib.link(traderPoolLeverageLib);

    const traderPoolViewLib = await TraderPoolViewLib.new();

    await TraderPoolMock.link(traderPoolCommissionLib);
    await TraderPoolMock.link(traderPoolLeverageLib);
    await TraderPoolMock.link(traderPoolPriceLib);
    await TraderPoolMock.link(traderPoolViewLib);
  });

  beforeEach("setup", async () => {
    const contractsRegistry = await ContractsRegistry.new();
    const _insurance = await Insurance.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    USD = await ERC20Mock.new("USD", "USD", 18);
    const _coreProperties = await CoreProperties.new();
    const _priceFeed = await PriceFeedMock.new();
    uniswapV2Router = await UniswapV2RouterMock.new();
    const _traderPoolRegistry = await TraderPoolRegistry.new();

    await contractsRegistry.__ContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.INSURANCE_NAME(), _insurance.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);
    await contractsRegistry.addProxyContract(
      await contractsRegistry.TRADER_POOL_REGISTRY_NAME(),
      _traderPoolRegistry.address
    );

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapV2Router.address);
    await contractsRegistry.addContract(await contractsRegistry.TRADER_POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), NOTHING);

    insurance = await Insurance.at(await contractsRegistry.getInsuranceContract());
    coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    priceFeed = await PriceFeedMock.at(await contractsRegistry.getPriceFeedContract());
    traderPoolRegistry = await TraderPoolRegistry.at(await contractsRegistry.getTraderPoolRegistryContract());

    await insurance.__Insurance_init();
    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await priceFeed.__PriceFeed_init();
    await traderPoolRegistry.__TraderPoolRegistry_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.INSURANCE_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());

    await configureBaseTokens();
  });

  async function deployPool(poolParameters) {
    const NAME = await traderPoolRegistry.BASIC_POOL_NAME();

    const traderPool = await TraderPoolMock.new();

    await traderPool.__TraderPoolMock_init("Test pool", "TP", poolParameters);

    await traderPoolRegistry.addPool(OWNER, NAME, traderPool.address, {
      from: FACTORY,
    });

    await traderPoolRegistry.injectDependenciesToExistingPools(NAME, 0, 10);

    return traderPool;
  }

  async function invest(amount, account) {
    const receptions = await traderPool.getInvestTokens(amount);
    await traderPool.invest(amount, receptions.receivedAmounts, { from: account });
  }

  async function divest(amount, account) {
    const divests = await traderPool.getDivestAmountsAndCommissions(OWNER, amount);

    await traderPool.divest(amount, divests.receptions.receivedAmounts, divests.commissions.dexeDexeCommission, {
      from: account,
    });
  }

  async function reinvestCommission(offset, limit) {
    const commissions = await traderPool.getReinvestCommissions(offset, limit);
    await traderPool.reinvestCommission(offset, limit, commissions.dexeDexeCommission);
  }

  async function exchangeFromExact(from, to, amount) {
    const exchange = (await traderPool.getExchangeFromExactAmount(from, to, amount, []))[0];
    await traderPool.exchangeFromExact(from, to, amount, exchange, []);
  }

  async function exchangeToExact(from, to, amount) {
    const exchange = (await traderPool.getExchangeToExactAmount(from, to, amount, []))[0];
    await traderPool.exchangeToExact(from, to, amount, exchange, []);
  }

  describe("First TraderPool", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: tokens.WETH.address,
        baseTokenDecimals: 18,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
      };

      traderPool = await deployPool(POOL_PARAMETERS);
    });

    describe("invest", () => {
      it("should invest", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        assert.isTrue((await traderPool.isTrader(OWNER)) && (await traderPool.isTraderAdmin(OWNER)));

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));
      });

      it("should invest twice", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("500"), OWNER);
        await invest(wei("500"), OWNER);

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));
      });

      it("should invest investor", async () => {
        await tokens.WETH.mint(SECOND, wei("1000"));

        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
        await invest(wei("1000"), SECOND);

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("2000"));
        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("1000"));

        const investorInfo = await traderPool.investorsInfo(SECOND);
        const investorSecondInfo = (await traderPool.getUsersInfo(0, 2))[1];

        assert.equal(investorInfo.investedBase.toFixed(), wei("1000"));
        assert.equal(
          investorInfo.commissionUnlockEpoch.toFixed(),
          toBN(await getCurrentBlockTime())
            .idiv(DEFAULT_CORE_PROPERTIES.commissionDurations[POOL_PARAMETERS.commissionPeriod])
            .plus(1)
        );
        assert.equal(toBN(investorSecondInfo.poolLPBalance).toFixed(), wei("1000"));
        assert.equal(toBN(investorSecondInfo.investedBase).toFixed(), wei("1000"));
        assert.equal(toBN(investorSecondInfo.poolUSDShare).toFixed(), wei("1000"));
        assert.equal(toBN(investorSecondInfo.poolBaseShare).toFixed(), wei("1000"));
      });
    });

    describe("exchange", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);
      });

      it("should exchange from exact tokens", async () => {
        await uniswapV2Router.setReserve(tokens.WBTC.address, wei("500000", 8));

        const exchange = (
          await traderPool.getExchangeFromExactAmount(tokens.WETH.address, tokens.WBTC.address, wei("500"), [])
        ).minAmountOut;

        assert.equal(exchange.toFixed(), wei("250"));

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));

        await traderPool.exchangeFromExact(tokens.WETH.address, tokens.WBTC.address, wei("500"), exchange, []);

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("500"));
        assert.equal((await tokens.WBTC.balanceOf(traderPool.address)).toFixed(), wei("250", 8));
      });

      it("should exchange to exact tokens", async () => {
        await uniswapV2Router.setReserve(tokens.WBTC.address, wei("500000", 8));

        const exchange = (
          await traderPool.getExchangeToExactAmount(tokens.WETH.address, tokens.WBTC.address, wei("250"), [])
        ).maxAmountIn;

        assert.equal(exchange.toFixed(), wei("500"));

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));

        await traderPool.exchangeToExact(tokens.WETH.address, tokens.WBTC.address, wei("250"), exchange, []);

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("500"));
        assert.equal((await tokens.WBTC.balanceOf(traderPool.address)).toFixed(), wei("250", 8));
      });
    });

    describe("leverage", () => {
      function leverage(usd, threshold, slope) {
        let multiplier = Math.floor(usd / threshold);

        let numerator = (multiplier + 1) * (2 * usd - threshold) + threshold - multiplier * multiplier * threshold;
        let boost = usd * 2;

        return toBN(numerator / slope + boost);
      }

      async function checkLeverage(usd) {
        let threshold = toBN(2500);
        let slope = toBN(5);

        await coreProperties.setTraderLeverageParams(threshold, slope);
        await tokens.WETH.approve(traderPool.address, wei(usd.toFixed()));
        await invest(wei(usd.toFixed()), OWNER);

        assert.equal(
          (await traderPool.getMaxTraderLeverage()).toFixed(),
          wei(leverage(usd.toNumber(), threshold.toNumber(), slope.toNumber()).toFixed())
        );
      }

      it("should calculate correct leverage 1", async () => {
        let usd = toBN(1000);

        await checkLeverage(usd);
      });

      it("should calculate correct leverage 2", async () => {
        let usd = toBN(56000);

        await checkLeverage(usd);
      });

      it("should calculate correct leverage 3", async () => {
        let usd = toBN(12745000);

        await checkLeverage(usd);
      });
    });

    describe("position", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("100"));
      });

      it("should open a position", async () => {
        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("900"));
        assert.equal((await tokens.MANA.balanceOf(traderPool.address)).toFixed(), wei("100"));

        const price = (
          await priceFeed.getExtendedPriceOut(tokens.WETH.address, tokens.MANA.address, wei("500"), [])
        )[0];

        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("400"));
        assert.equal(
          (await tokens.MANA.balanceOf(traderPool.address)).toFixed(),
          toBN(wei("100")).plus(price).toFixed()
        );
      });

      it("should close a position", async () => {
        assert.equal((await traderPool.openPositions()).length, 1);

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("100"));

        assert.equal((await traderPool.openPositions()).length, 0);
      });

      it("should reopen a position", async () => {
        assert.equal((await traderPool.openPositions()).length, 1);

        const price = (await priceFeed.getExtendedPriceOut(tokens.MANA.address, tokens.WBTC.address, wei("50"), []))[0];

        await exchangeFromExact(tokens.MANA.address, tokens.WBTC.address, wei("50"));

        assert.equal((await traderPool.openPositions()).length, 2);

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("900"));
        assert.equal((await tokens.MANA.balanceOf(traderPool.address)).toFixed(), wei("50"));
        assert.equal((await tokens.WBTC.balanceOf(traderPool.address)).toFixed(), price.toFixed());
      });
    });

    describe("commission", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.mint(SECOND, wei("1000"));

        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
        await invest(wei("1000"), SECOND);
      });

      it("should calculate trader's commission", async () => {
        let leverage = await traderPool.getLeverageInfo();

        assert.equal(toBN(leverage.totalPoolUSDWithProposals).toFixed(), wei("2000"));
        assert.equal(toBN(leverage.traderLeverageUSDTokens).toFixed(), wei("2400"));

        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        leverage = await traderPool.getLeverageInfo();

        assert.closeTo(
          toBN(leverage.totalPoolUSDWithProposals).toNumber(),
          toBN(wei("2000")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(leverage.traderLeverageUSDTokens).toNumber(),
          toBN(wei("2400")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("1000"));

        leverage = await traderPool.getLeverageInfo();

        assert.closeTo(
          toBN(leverage.totalPoolUSDWithProposals).toNumber(),
          toBN(wei("3006")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(leverage.traderLeverageUSDTokens).toNumber(),
          toBN(wei("3607")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("3000"));

        await truffleAssert.reverts(reinvestCommission(0, 5), "TP: no commission available");

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_MONTH);

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));

        await reinvestCommission(0, 5);

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          toBN(wei("1116.6666666")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );

        await truffleAssert.reverts(reinvestCommission(0, 5), "TP: no commission available");
      });

      it("there shouldn't be any commission 1", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await tokens.MANA.approve(uniswapV2Router.address, wei("2000000"));
        await uniswapV2Router.setReserve(tokens.MANA.address, wei("2000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("1000"));

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1500"));

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_MONTH);

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));

        await truffleAssert.reverts(reinvestCommission(0, 5), "TP: no commission available");
      });

      it("there shouldn't be any commission 2", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("1000"));

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_MONTH);

        await reinvestCommission(0, 5);

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          toBN(wei("1116.6666666")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_MONTH);

        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("200"));

        await tokens.MANA.approve(uniswapV2Router.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.MANA.address, wei("1000000"));

        await exchangeFromExact(
          tokens.MANA.address,
          tokens.WETH.address,
          await tokens.MANA.balanceOf(traderPool.address)
        );

        await truffleAssert.reverts(reinvestCommission(0, 5), "TP: no commission available");
      });
    });

    describe("divest", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.mint(SECOND, wei("1000"));

        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
        await invest(wei("1000"), SECOND);
      });

      it("should divest trader", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("1000"));

        const balance = await tokens.WETH.balanceOf(OWNER);

        await divest(wei("500"), OWNER);

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("500"));
        assert.equal((await tokens.WETH.balanceOf(OWNER)).toFixed(), balance.plus(wei("750")).toFixed());
      });

      it("should divest investor with commission", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("1000"));

        const balance = await traderPool.balanceOf(OWNER);

        await divest(wei("1000"), SECOND);

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          balance.plus(wei("116.66666666")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
        assert.equal((await tokens.WETH.balanceOf(SECOND)).toFixed(), wei("1250"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), "0");
      });

      it("should divest investor without commission", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await tokens.MANA.approve(uniswapV2Router.address, wei("2000000"));
        await uniswapV2Router.setReserve(tokens.MANA.address, wei("2000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("1000"));

        const balance = await traderPool.balanceOf(OWNER);

        await divest(wei("1000"), SECOND);

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), balance.toFixed());
        assert.equal((await tokens.WETH.balanceOf(SECOND)).toFixed(), wei("750"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), "0");
      });

      it("should divest investor with open positions with commission", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        const balance = await traderPool.balanceOf(OWNER);

        await divest(wei("1000"), SECOND);

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          balance.plus(wei("116.66666666")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
        assert.equal((await tokens.WETH.balanceOf(SECOND)).toFixed(), wei("1250"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), "0");
      });

      it("should divest investor with open positions without commission", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await tokens.MANA.approve(uniswapV2Router.address, wei("2000000"));
        await uniswapV2Router.setReserve(tokens.MANA.address, wei("2000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        const balance = await traderPool.balanceOf(OWNER);

        await divest(wei("1000"), SECOND);

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), balance.toFixed());
        assert.equal((await tokens.WETH.balanceOf(SECOND)).toFixed(), wei("750"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), "0");
      });

      it("should divest investor half with commission", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        const balance = await traderPool.balanceOf(OWNER);

        await divest(wei("500"), SECOND);

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          balance.plus(wei("58.33333333")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
        assert.equal((await tokens.WETH.balanceOf(SECOND)).toFixed(), wei("625"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), wei("500"));
      });
    });

    describe("token transfer", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.mint(SECOND, wei("1000"));

        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
        await invest(wei("1000"), SECOND);
      });

      it("should transfer trader tokens to a third party", async () => {
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));
        assert.equal((await traderPool.investorsInfo(OWNER)).investedBase.toFixed(), "0");

        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("1000"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), wei("1000"));

        assert.equal((await traderPool.balanceOf(THIRD)).toFixed(), "0");
        assert.equal((await traderPool.investorsInfo(THIRD)).investedBase.toFixed(), "0");

        await traderPool.transfer(THIRD, wei("500"));
        await traderPool.transfer(SECOND, wei("100"), { from: THIRD });

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("500"));
        assert.equal((await traderPool.investorsInfo(OWNER)).investedBase.toFixed(), "0");

        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("1100"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), wei("1000"));

        assert.equal((await traderPool.balanceOf(THIRD)).toFixed(), wei("400"));
        assert.equal((await traderPool.investorsInfo(THIRD)).investedBase.toFixed(), "0");
      });

      it("should transfer investor tokens to a third party", async () => {
        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("1000"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), wei("1000"));

        assert.equal((await traderPool.balanceOf(THIRD)).toFixed(), "0");
        assert.equal((await traderPool.investorsInfo(THIRD)).investedBase.toFixed(), "0");

        await traderPool.transfer(THIRD, wei("500"), { from: SECOND });

        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("500"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), wei("500"));

        assert.equal((await traderPool.balanceOf(THIRD)).toFixed(), wei("500"));
        assert.equal((await traderPool.investorsInfo(THIRD)).investedBase.toFixed(), wei("500"));
      });
    });
  });

  describe("Second TraderPool", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: tokens.WBTC.address,
        baseTokenDecimals: 8,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
      };

      traderPool = await deployPool(POOL_PARAMETERS);
    });

    describe("invest", () => {
      it("should invest", async () => {
        await tokens.WBTC.approve(traderPool.address, wei("1000", 8));
        await invest(wei("1000"), OWNER);

        assert.isTrue((await traderPool.isTrader(OWNER)) && (await traderPool.isTraderAdmin(OWNER)));

        assert.equal((await tokens.WBTC.balanceOf(traderPool.address)).toFixed(), wei("1000", 8));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));
      });

      it("should invest investor", async () => {
        await tokens.WBTC.mint(SECOND, wei("1000", 8));

        await tokens.WBTC.approve(traderPool.address, wei("1000", 8));
        await invest(wei("1000"), OWNER);

        await tokens.WBTC.approve(traderPool.address, wei("1000", 8), { from: SECOND });
        await invest(wei("1000"), SECOND);

        assert.equal((await tokens.WBTC.balanceOf(traderPool.address)).toFixed(), wei("2000", 8));
        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("1000"));

        const investorInfo = await traderPool.investorsInfo(SECOND);

        assert.equal(investorInfo.investedBase.toFixed(), wei("1000"));
        assert.equal(
          investorInfo.commissionUnlockEpoch.toFixed(),
          toBN(await getCurrentBlockTime())
            .idiv(DEFAULT_CORE_PROPERTIES.commissionDurations[POOL_PARAMETERS.commissionPeriod])
            .plus(1)
        );
      });

      it("should invest active portfolio", async () => {
        await tokens.WBTC.approve(traderPool.address, wei("1000", 8));
        await invest(wei("1000"), OWNER);

        await exchangeFromExact(tokens.WBTC.address, tokens.MANA.address, wei("400"));

        const wbtcBalance = await tokens.WBTC.balanceOf(traderPool.address);
        const manaBalance = await tokens.MANA.balanceOf(traderPool.address);

        assert.equal(wbtcBalance.toFixed(), wei("600", 8));
        assert.equal(manaBalance.toFixed(), wei("400"));

        const manaPrice = (
          await priceFeed.getExtendedPriceOut(tokens.MANA.address, tokens.WBTC.address, wei("400"), [])
        )[0];
        const wbtcPrice = await tokens.WBTC.balanceOf(traderPool.address);
        const totalPrice = manaPrice.plus(wbtcPrice);

        const proportionWBTC = toBN(wei("1000", 8)).times(wbtcPrice).idiv(totalPrice);
        const proportionMANA = toBN(wei("1000", 8)).times(manaPrice).idiv(totalPrice);

        const wbtc = wbtcBalance.plus(proportionWBTC).plus(1);
        const mana = manaBalance.plus(
          (await priceFeed.getExtendedPriceOut(tokens.WBTC.address, tokens.MANA.address, proportionMANA, []))[0]
        );

        await tokens.WBTC.mint(SECOND, wei("1000", 8));

        await tokens.WBTC.approve(traderPool.address, wei("1000", 8), { from: SECOND });
        await invest(wei("1000"), SECOND);

        assert.equal((await tokens.WBTC.balanceOf(traderPool.address)).toFixed(), wbtc.toFixed());
        assert.equal((await tokens.MANA.balanceOf(traderPool.address)).toFixed(), mana.toFixed());
      });
    });
  });
});
