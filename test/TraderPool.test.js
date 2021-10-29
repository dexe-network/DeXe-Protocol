const { assert } = require("chai");
const { toBN, accounts, wei } = require("./helpers/utils");
const { setNextBlockTime, getCurrentBlockTime } = require("./helpers/hardhatTimeTraveller");
const truffleAssert = require("truffle-assertions");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const Insurance = artifacts.require("Insurance");
const ERC20Mock = artifacts.require("ERC20Mock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeedMock = artifacts.require("PriceFeedMock");
const UniswapRouterV2Mock = artifacts.require("UniswapRouterV2Mock");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");
const TraderPoolMock = artifacts.require("TraderPoolMock");
const TraderPoolHelperLib = artifacts.require("TraderPoolHelper");

ContractsRegistry.numberFormat = "BigNumber";
Insurance.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeedMock.numberFormat = "BigNumber";
UniswapRouterV2Mock.numberFormat = "BigNumber";
TraderPoolRegistry.numberFormat = "BigNumber";
TraderPoolMock.numberFormat = "BigNumber";

const SECONDS_IN_DAY = 86400;
const SECONDS_IN_MONTH = SECONDS_IN_DAY * 30;
const PRECISION = toBN(10).pow(25);

const ComissionPeriods = {
  PERIOD_1: 0,
  PERIOD_2: 1,
  PERIOD_3: 2,
};

const DEFAULT_CORE_PROPERTIES = {
  maximumPoolInvestors: 1000,
  maximumOpenPositions: 25,
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
  minimalTraderCommission: PRECISION.times(20).toFixed(),
  maximalTraderCommissions: [
    PRECISION.times(30).toFixed(),
    PRECISION.times(50).toFixed(),
    PRECISION.times(70).toFixed(),
  ],
};

describe("TraderPool", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let FACTORY;
  let NOTHING;

  let insurance;
  let DEXE;
  let DAI;
  let coreProperties;
  let priceFeed;
  let uniswapRouterV2;
  let traderPoolRegistry;
  let baseTokens = {};

  async function configureBaseTokens() {
    let tokensToMint = toBN(1000000000);
    let reserveTokens = toBN(1000000);

    let tokens = ["DAI", "DEXE", "WETH", "USDT", "MANA", "WBTC"];
    let decimals = [18, 18, 18, 6, 18, 8];

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] == "DAI") {
        baseTokens[tokens[i]] = DAI;
      } else if (tokens[i] == "DEXE") {
        baseTokens[tokens[i]] = DEXE;
      } else {
        baseTokens[tokens[i]] = await ERC20Mock.new(tokens[i], tokens[i], decimals[i]);
      }

      let decimalWei = toBN(10).pow(decimals[i]);

      await baseTokens[tokens[i]].mint(OWNER, tokensToMint.times(decimalWei));

      await priceFeed.addSupportedBaseTokens([baseTokens[tokens[i]].address]);

      await baseTokens[tokens[i]].approve(uniswapRouterV2.address, reserveTokens.times(decimalWei));
      await uniswapRouterV2.setReserve(baseTokens[tokens[i]].address, reserveTokens.times(decimalWei));
    }
  }

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    FACTORY = await accounts(3);
    NOTHING = await accounts(9);

    const traderPoolHelperLib = await TraderPoolHelperLib.new();
    await TraderPoolMock.link(traderPoolHelperLib);
  });

  beforeEach("setup", async () => {
    const contractsRegistry = await ContractsRegistry.new();
    const _insurance = await Insurance.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    DAI = await ERC20Mock.new("DAI", "DAI", 18);
    const _coreProperties = await CoreProperties.new();
    const _priceFeed = await PriceFeedMock.new();
    uniswapRouterV2 = await UniswapRouterV2Mock.new();
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
    await contractsRegistry.addContract(await contractsRegistry.DAI_NAME(), DAI.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapRouterV2.address);
    await contractsRegistry.addContract(await contractsRegistry.TRADER_POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);

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

    await configureBaseTokens();
  });

  async function deployPool(poolParameters) {
    const NAME = await traderPoolRegistry.BASIC_POOL_NAME();

    const traderPool = await TraderPoolMock.new();

    await traderPool.__TraderPool_init("Test pool", "TP", poolParameters);

    await traderPoolRegistry.addPool(OWNER, NAME, traderPool.address, {
      from: FACTORY,
    });

    await traderPoolRegistry.injectDependenciesToExistingPools(NAME, 0, 10);

    return traderPool;
  }

  describe("Default TraderPool", () => {
    let POOL_PARAMETERS;

    let traderPool;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        activePortfolio: false,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: baseTokens.WETH.address,
        baseTokenDecimals: 18,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
      };

      traderPool = await deployPool(POOL_PARAMETERS);
    });

    describe("invest", () => {
      it("should invest", async () => {
        await baseTokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));

        assert.isTrue((await traderPool.isTrader(OWNER)) && (await traderPool.isTraderAdmin(OWNER)));

        assert.equal((await baseTokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));
      });

      it("should invest twice", async () => {
        await baseTokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("500"));
        await traderPool.invest(wei("500"));

        assert.equal((await baseTokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));
      });

      it("should invest investor", async () => {
        await baseTokens.WETH.mint(SECOND, wei("1000"));

        await baseTokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));

        await baseTokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
        await traderPool.invest(wei("1000"), { from: SECOND });

        assert.equal((await baseTokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("2000"));
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

        assert.equal(
          (await traderPool.getMaxTraderLeverage(wei(usd.toFixed()), threshold, slope)).toFixed(),
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
      it("should open a position", async () => {
        await baseTokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));

        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("100"));

        assert.equal((await baseTokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("900"));
        assert.equal((await baseTokens.MANA.balanceOf(traderPool.address)).toFixed(), wei("100"));

        const price = await priceFeed.getPriceIn(wei("500"), baseTokens.WETH.address, baseTokens.MANA.address);

        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("500"));

        assert.equal((await baseTokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("400"));
        assert.equal((await baseTokens.MANA.balanceOf(traderPool.address)).toFixed(), toBN(wei("100")).plus(price));
      });

      it("should close a position", async () => {
        await baseTokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));

        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("100"));

        assert.equal((await traderPool.openPositions()).length, 1);

        await traderPool.exchange(baseTokens.MANA.address, baseTokens.WETH.address, wei("100"));

        assert.equal((await traderPool.openPositions()).length, 0);
      });

      it("should reopen a position", async () => {
        await baseTokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));

        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("100"));

        assert.equal((await traderPool.openPositions()).length, 1);

        const price = await priceFeed.getPriceIn(wei("50"), baseTokens.MANA.address, baseTokens.WBTC.address);

        await traderPool.exchange(baseTokens.MANA.address, baseTokens.WBTC.address, wei("50"));

        assert.equal((await traderPool.openPositions()).length, 2);

        assert.equal((await baseTokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("900"));
        assert.equal((await baseTokens.MANA.balanceOf(traderPool.address)).toFixed(), wei("50"));
        assert.equal((await baseTokens.WBTC.balanceOf(traderPool.address)).toFixed(), price.toFixed());
      });
    });

    describe("commission", () => {
      const ONE_MONTH = 60 * 60 * 24 * 30;

      beforeEach("setup", async () => {
        await baseTokens.WETH.mint(SECOND, wei("1000"));

        await baseTokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));

        await baseTokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
        await traderPool.invest(wei("1000"), { from: SECOND });
      });

      it("should calculate trader's commission", async () => {
        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("1000"));

        await uniswapRouterV2.setReserve(baseTokens.MANA.address, toBN(wei("500000")));

        await traderPool.exchange(baseTokens.MANA.address, baseTokens.WETH.address, wei("1000"));

        assert.equal((await baseTokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("3000"));

        await truffleAssert.reverts(traderPool.reinvestCommission(0, 5), "TraderPool: no commission available");

        await setNextBlockTime((await getCurrentBlockTime()) + ONE_MONTH);

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));

        await traderPool.reinvestCommission(0, 5);

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          toBN(wei("1116.6666666")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );

        await truffleAssert.reverts(traderPool.reinvestCommission(0, 5), "TraderPool: no commission available");
      });

      it("there shouldn't be any commission 1", async () => {
        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("1000"));

        await baseTokens.MANA.approve(uniswapRouterV2.address, toBN(wei("2000000")));
        await uniswapRouterV2.setReserve(baseTokens.MANA.address, toBN(wei("2000000")));

        await traderPool.exchange(baseTokens.MANA.address, baseTokens.WETH.address, wei("1000"));

        assert.equal((await baseTokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1500"));

        await setNextBlockTime((await getCurrentBlockTime()) + ONE_MONTH);

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));

        await truffleAssert.reverts(traderPool.reinvestCommission(0, 5), "TraderPool: no commission available");
      });

      it("there shouldn't be any commission 2", async () => {
        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("1000"));

        await uniswapRouterV2.setReserve(baseTokens.MANA.address, toBN(wei("500000")));

        await traderPool.exchange(baseTokens.MANA.address, baseTokens.WETH.address, wei("1000"));

        await setNextBlockTime((await getCurrentBlockTime()) + ONE_MONTH);

        await traderPool.reinvestCommission(0, 5);

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          toBN(wei("1116.6666666")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );

        await setNextBlockTime((await getCurrentBlockTime()) + ONE_MONTH);

        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("200"));

        await baseTokens.MANA.approve(uniswapRouterV2.address, toBN(wei("1000000")));
        await uniswapRouterV2.setReserve(baseTokens.MANA.address, toBN(wei("1000000")));

        await traderPool.exchange(
          baseTokens.MANA.address,
          baseTokens.WETH.address,
          await baseTokens.MANA.balanceOf(traderPool.address)
        );

        await truffleAssert.reverts(traderPool.reinvestCommission(0, 5), "TraderPool: no commission available");
      });
    });

    describe("divest", () => {
      beforeEach("setup", async () => {
        await baseTokens.WETH.mint(SECOND, wei("1000"));

        await baseTokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));

        await baseTokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
        await traderPool.invest(wei("1000"), { from: SECOND });
      });

      it("should divest trader", async () => {
        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("1000"));

        await uniswapRouterV2.setReserve(baseTokens.MANA.address, toBN(wei("500000")));

        await traderPool.exchange(baseTokens.MANA.address, baseTokens.WETH.address, wei("1000"));

        const balance = await baseTokens.WETH.balanceOf(OWNER);

        await traderPool.divest(wei("500"));

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("500"));
        assert.equal((await baseTokens.WETH.balanceOf(OWNER)).toFixed(), balance.plus(wei("750")).toFixed());
      });

      it("should divest investor with commission", async () => {
        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("1000"));

        await uniswapRouterV2.setReserve(baseTokens.MANA.address, toBN(wei("500000")));

        await traderPool.exchange(baseTokens.MANA.address, baseTokens.WETH.address, wei("1000"));

        const balance = await traderPool.balanceOf(OWNER);

        await traderPool.divest(wei("1000"), { from: SECOND });

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          balance.plus(wei("116.66666666")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
        assert.equal((await baseTokens.WETH.balanceOf(SECOND)).toFixed(), wei("1250"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), "0");
      });

      it("should divest investor without commission", async () => {
        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("1000"));

        await baseTokens.MANA.approve(uniswapRouterV2.address, toBN(wei("2000000")));
        await uniswapRouterV2.setReserve(baseTokens.MANA.address, toBN(wei("2000000")));

        await traderPool.exchange(baseTokens.MANA.address, baseTokens.WETH.address, wei("1000"));

        const balance = await traderPool.balanceOf(OWNER);

        await traderPool.divest(wei("1000"), { from: SECOND });

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), balance.toFixed());
        assert.equal((await baseTokens.WETH.balanceOf(SECOND)).toFixed(), wei("750"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), "0");
      });

      it("should divest investor with open positions with commission", async () => {
        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("1000"));

        await uniswapRouterV2.setReserve(baseTokens.MANA.address, toBN(wei("500000")));

        const balance = await traderPool.balanceOf(OWNER);

        await traderPool.divest(wei("1000"), { from: SECOND });

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          balance.plus(wei("116.66666666")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
        assert.equal((await baseTokens.WETH.balanceOf(SECOND)).toFixed(), wei("1250"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), "0");
      });

      it("should divest investor with open positions without commission", async () => {
        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("1000"));

        await baseTokens.MANA.approve(uniswapRouterV2.address, toBN(wei("2000000")));
        await uniswapRouterV2.setReserve(baseTokens.MANA.address, toBN(wei("2000000")));

        const balance = await traderPool.balanceOf(OWNER);

        await traderPool.divest(wei("1000"), { from: SECOND });

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), balance.toFixed());
        assert.equal((await baseTokens.WETH.balanceOf(SECOND)).toFixed(), wei("750"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), "0");
      });

      it("should divest investor half with commission", async () => {
        await traderPool.exchange(baseTokens.WETH.address, baseTokens.MANA.address, wei("1000"));

        await uniswapRouterV2.setReserve(baseTokens.MANA.address, toBN(wei("500000")));

        const balance = await traderPool.balanceOf(OWNER);

        await traderPool.divest(wei("500"), { from: SECOND });

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          balance.plus(wei("58.33333333")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
        assert.equal((await baseTokens.WETH.balanceOf(SECOND)).toFixed(), wei("625"));
        assert.equal((await traderPool.investorsInfo(SECOND)).investedBase.toFixed(), wei("500"));
      });
    });

    describe("token transfer", () => {
      beforeEach("setup", async () => {
        await baseTokens.WETH.mint(SECOND, wei("1000"));

        await baseTokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));

        await baseTokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
        await traderPool.invest(wei("1000"), { from: SECOND });
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

  describe("Active TraderPool", () => {
    let POOL_PARAMETERS;

    let traderPool;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        activePortfolio: true,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: baseTokens.WBTC.address,
        baseTokenDecimals: 8,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
      };

      traderPool = await deployPool(POOL_PARAMETERS);
    });

    describe("invest", () => {
      it("should invest", async () => {
        await baseTokens.WBTC.approve(traderPool.address, wei("1000", 8));
        await traderPool.invest(wei("1000"));

        assert.isTrue((await traderPool.isTrader(OWNER)) && (await traderPool.isTraderAdmin(OWNER)));

        assert.equal((await baseTokens.WBTC.balanceOf(traderPool.address)).toFixed(), wei("1000", 8));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));
      });

      it("should invest investor", async () => {
        await baseTokens.WBTC.mint(SECOND, wei("1000", 8));

        await baseTokens.WBTC.approve(traderPool.address, wei("1000", 8));
        await traderPool.invest(wei("1000"));

        await baseTokens.WBTC.approve(traderPool.address, wei("1000", 8), { from: SECOND });
        await traderPool.invest(wei("1000"), { from: SECOND });

        assert.equal((await baseTokens.WBTC.balanceOf(traderPool.address)).toFixed(), wei("2000", 8));
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
        await baseTokens.WBTC.approve(traderPool.address, wei("1000", 8));
        await traderPool.invest(wei("1000"));

        await traderPool.exchange(baseTokens.WBTC.address, baseTokens.MANA.address, wei("400"));

        const wbtcBalance = await baseTokens.WBTC.balanceOf(traderPool.address);
        const manaBalance = await baseTokens.MANA.balanceOf(traderPool.address);

        assert.equal(wbtcBalance.toFixed(), wei("600", 8));
        assert.equal(manaBalance.toFixed(), wei("400"));

        const manaPrice = await priceFeed.getPriceIn(wei("400"), baseTokens.MANA.address, baseTokens.WBTC.address);
        const wbtcPrice = await baseTokens.WBTC.balanceOf(traderPool.address);
        const totalPrice = manaPrice.plus(wbtcPrice);

        const proportionWBTC = toBN(wei("1000", 8)).times(wbtcPrice).idiv(totalPrice);
        const proportionMANA = toBN(wei("1000", 8)).times(manaPrice).idiv(totalPrice);

        const wbtc = wbtcBalance.plus(proportionWBTC).plus(1);
        const mana = manaBalance.plus(
          await priceFeed.getPriceIn(proportionMANA, baseTokens.WBTC.address, baseTokens.MANA.address)
        );

        await baseTokens.WBTC.mint(SECOND, wei("1000", 8));

        await baseTokens.WBTC.approve(traderPool.address, wei("1000", 8), { from: SECOND });
        await traderPool.invest(wei("1000"), { from: SECOND });

        assert.equal((await baseTokens.WBTC.balanceOf(traderPool.address)).toFixed(), wbtc.toFixed());
        assert.equal((await baseTokens.MANA.balanceOf(traderPool.address)).toFixed(), mana.toFixed());
      });
    });
  });
});
