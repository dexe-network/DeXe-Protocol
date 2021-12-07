const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const { setNextBlockTime, getCurrentBlockTime } = require("./helpers/hardhatTimeTraveller");
const truffleAssert = require("truffle-assertions");
const { assert } = require("chai");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const Insurance = artifacts.require("Insurance");
const ERC20Mock = artifacts.require("ERC20Mock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeedMock = artifacts.require("PriceFeedMock");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const TraderPoolRegistry = artifacts.require("TraderPoolRegistry");
const InvestTraderPool = artifacts.require("InvestTraderPool");
const PoolProposal = artifacts.require("TraderPoolInvestProposal");
const TraderPoolHelperLib = artifacts.require("TraderPoolHelper");

ContractsRegistry.numberFormat = "BigNumber";
Insurance.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeedMock.numberFormat = "BigNumber";
UniswapV2RouterMock.numberFormat = "BigNumber";
TraderPoolRegistry.numberFormat = "BigNumber";
InvestTraderPool.numberFormat = "BigNumber";
PoolProposal.numberFormat = "BigNumber";

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
  delayForRiskyPool: SECONDS_IN_DAY * 20,
};

describe("InvestTraderPool", () => {
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
  let uniswapV2Router;
  let traderPoolRegistry;
  let tokens = {};

  async function configureBaseTokens() {
    let tokensToMint = toBN(1000000000);
    let reserveTokens = toBN(1000000);

    let tokenNames = ["DAI", "DEXE", "WETH", "USDT", "MANA", "WBTC"];
    let decimals = [18, 18, 18, 6, 18, 8];
    let support = [true, true, true, false, true, false];

    for (let i = 0; i < tokenNames.length; i++) {
      if (tokenNames[i] == "DAI") {
        tokens[tokenNames[i]] = DAI;
      } else if (tokenNames[i] == "DEXE") {
        tokens[tokenNames[i]] = DEXE;
      } else {
        tokens[tokenNames[i]] = await ERC20Mock.new(tokenNames[i], tokenNames[i], decimals[i]);
      }

      let decimalWei = toBN(10).pow(decimals[i]);

      await tokens[tokenNames[i]].mint(OWNER, tokensToMint.times(decimalWei));

      if (support[i]) {
        await priceFeed.addSupportedBaseTokens([tokens[tokenNames[i]].address]);
      }

      await tokens[tokenNames[i]].approve(uniswapV2Router.address, reserveTokens.times(decimalWei));
      await uniswapV2Router.setReserve(tokens[tokenNames[i]].address, reserveTokens.times(decimalWei));
    }
  }

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
    FACTORY = await accounts(3);
    NOTHING = await accounts(9);

    const traderPoolHelperLib = await TraderPoolHelperLib.new();
    await InvestTraderPool.link(traderPoolHelperLib);
  });

  beforeEach("setup", async () => {
    const contractsRegistry = await ContractsRegistry.new();
    const _insurance = await Insurance.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    DAI = await ERC20Mock.new("DAI", "DAI", 18);
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
    await contractsRegistry.addContract(await contractsRegistry.DAI_NAME(), DAI.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapV2Router.address);
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
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());

    await configureBaseTokens();
  });

  async function deployPool(poolParameters) {
    const POOL_NAME = await traderPoolRegistry.INVEST_POOL_NAME();

    const traderPool = await InvestTraderPool.new();
    const proposal = await PoolProposal.new();

    const parentPoolInfo = {
      parentPoolAddress: traderPool.address,
      trader: poolParameters.trader,
      baseToken: poolParameters.baseToken,
      baseTokenDecimals: poolParameters.baseTokenDecimals,
    };

    await traderPool.__InvestTraderPool_init("Test pool", "TP", poolParameters, proposal.address);
    await proposal.__TraderPoolInvestProposal_init(parentPoolInfo);

    await traderPoolRegistry.addPool(OWNER, POOL_NAME, traderPool.address, {
      from: FACTORY,
    });

    await traderPoolRegistry.injectDependenciesToExistingPools(POOL_NAME, 0, 10);

    return [traderPool, proposal];
  }

  describe("Default Pool", () => {
    let POOL_PARAMETERS = {};

    let traderPool;
    let proposalPool;

    beforeEach("Pool parameters", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        totalLPEmission: 0,
        baseToken: tokens.WETH.address,
        baseTokenDecimals: 18,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(30).times(PRECISION).toFixed(),
      };

      [traderPool, proposalPool] = await deployPool(POOL_PARAMETERS);
    });

    describe("invest", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
      });

      it("should revert when investing before exchange", async () => {
        await truffleAssert.reverts(traderPool.invest(wei("100"), { from: SECOND }), "BTP: investment delay");
      });

      it("should revert when investing with delay", async () => {
        await tokens.WETH.approve(traderPool.address, wei("100"));

        await traderPool.invest(wei("100"));
        await traderPool.exchange(tokens.WETH.address, tokens.USDT.address, wei("100"));

        await truffleAssert.reverts(traderPool.invest(wei("100"), { from: SECOND }), "BTP: investment delay");
      });

      it("should invest after delay", async () => {
        await tokens.WETH.approve(traderPool.address, wei("100"));

        await traderPool.invest(wei("100"));
        await traderPool.exchange(tokens.WETH.address, tokens.USDT.address, wei("100"));

        await setNextBlockTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await truffleAssert.passes(traderPool.invest(wei("100"), { from: SECOND }), "Invested");
      });
    });

    describe("createProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));
      });

      it("should create a proposal", async () => {
        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));

        const time = toBN(await getCurrentBlockTime());

        await traderPool.createProposal(wei("100"), time.plus(100000), wei("10000"));

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("100"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("100"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("900"));
      });

      it("should create 2 proposals", async () => {
        const time = toBN(await getCurrentBlockTime());

        await traderPool.createProposal(wei("100"), time.plus(100000), wei("10000"));
        await traderPool.createProposal(wei("100"), time.plus(100000), wei("10000"));

        assert.equal((await proposalPool.proposalsTotalNum()).toFixed(), "2");

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("100"));
        assert.equal((await proposalPool.balanceOf(OWNER, 2)).toFixed(), wei("100"));

        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("200"));

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("800"));
      });
    });

    describe("investProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
      });

      it("should invest into the proposal", async () => {
        const time = toBN(await getCurrentBlockTime());

        await traderPool.createProposal(wei("100"), time.plus(10000000), wei("10000"));

        await traderPool.exchange(tokens.WETH.address, tokens.USDT.address, wei("100"));
        await setNextBlockTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await traderPool.invest(wei("1000"), { from: SECOND });
        await traderPool.investProposal(1, wei("500"), { from: SECOND });

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("100"));
        assert.closeTo(
          (await proposalPool.balanceOf(SECOND, 1)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("600"));
        assert.closeTo(
          (await traderPool.balanceOf(SECOND)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });
    });

    describe("withdrawProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
      });

      it("should withdraw the deposit", async () => {
        const time = toBN(await getCurrentBlockTime());

        await traderPool.createProposal(wei("100"), time.plus(10000000), wei("10000"));

        await traderPool.exchange(tokens.WETH.address, tokens.USDT.address, wei("100"));
        await setNextBlockTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await traderPool.invest(wei("1000"), { from: SECOND });
        await traderPool.investProposal(1, wei("500"), { from: SECOND });

        let info = await proposalPool.proposalInfos(1);
        assert.closeTo(info.newInvestedBase.toNumber(), toBN(wei("600")).toNumber(), toBN(wei("1")).toNumber());

        assert.equal((await tokens.WETH.balanceOf(OWNER)).toFixed(), wei("998999000"));

        await traderPool.withdrawProposal(1, wei("600"));

        assert.equal((await tokens.WETH.balanceOf(OWNER)).toFixed(), wei("998999600"));

        info = await proposalPool.proposalInfos(1);
        assert.closeTo(info.newInvestedBase.toNumber(), toBN(wei("0")).toNumber(), toBN(wei("1")).toNumber());
      });
    });

    describe("claimProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await traderPool.invest(wei("1000"));

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });

        const time = toBN(await getCurrentBlockTime());

        await traderPool.createProposal(wei("100"), time.plus(10000000), wei("10000"));

        await traderPool.exchange(tokens.WETH.address, tokens.USDT.address, wei("100"));
        await setNextBlockTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await traderPool.invest(wei("1000"), { from: SECOND });
        await traderPool.investProposal(1, wei("500"), { from: SECOND });
      });

      it("should claim the deposit", async () => {
        await traderPool.withdrawProposal(1, wei("600"));

        await tokens.WETH.approve(proposalPool.address, wei("600"));
        await traderPool.supplyProposal(1, wei("600"));

        assert.equal((await tokens.WETH.balanceOf(SECOND)).toFixed(), "0");

        await traderPool.claimProposal(1, { from: SECOND });

        assert.closeTo(
          (await tokens.WETH.balanceOf(SECOND)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await truffleAssert.reverts(traderPool.claimProposal(1, { from: SECOND }), "TPIP: nothing to claim");
      });

      it("should claim the deposit twice", async () => {
        await traderPool.withdrawProposal(1, wei("600"));

        await tokens.WETH.approve(proposalPool.address, wei("1000"));

        await traderPool.supplyProposal(1, wei("600"));
        await traderPool.claimProposal(1, { from: SECOND });

        assert.closeTo(
          (await tokens.WETH.balanceOf(SECOND)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await traderPool.supplyProposal(1, wei("400"));
        await traderPool.claimProposal(1, { from: SECOND });

        assert.closeTo(
          (await tokens.WETH.balanceOf(SECOND)).toNumber(),
          toBN(wei("833")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });
    });
  });
});
