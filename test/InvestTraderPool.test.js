const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const { setTime, getCurrentBlockTime } = require("./helpers/hardhatTimeTraveller");
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
const PoolProposalLib = artifacts.require("TraderPoolInvestProposalView");
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
InvestTraderPool.numberFormat = "BigNumber";
PoolProposal.numberFormat = "BigNumber";

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

describe("InvestTraderPool", () => {
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
  let proposalPool;

  async function configureBaseTokens() {
    let tokensToMint = toBN(1000000000);
    let reserveTokens = toBN(1000000);

    let tokenNames = ["USD", "DEXE", "WETH", "USDT", "MANA", "WBTC"];
    let decimals = [18, 18, 18, 6, 18, 8];
    let support = [true, true, true, false, true, false];

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

    const traderPoolPriceLib = await TraderPoolPriceLib.new();

    await TraderPoolCommissionLib.link(traderPoolPriceLib);
    await TraderPoolLeverageLib.link(traderPoolPriceLib);

    const traderPoolCommissionLib = await TraderPoolCommissionLib.new();
    const traderPoolLeverageLib = await TraderPoolLeverageLib.new();

    await TraderPoolViewLib.link(traderPoolPriceLib);
    await TraderPoolViewLib.link(traderPoolCommissionLib);
    await TraderPoolViewLib.link(traderPoolLeverageLib);

    const traderPoolViewLib = await TraderPoolViewLib.new();

    await InvestTraderPool.link(traderPoolCommissionLib);
    await InvestTraderPool.link(traderPoolLeverageLib);
    await InvestTraderPool.link(traderPoolPriceLib);
    await InvestTraderPool.link(traderPoolViewLib);

    const poolProposalLib = await PoolProposalLib.new();

    await PoolProposal.link(poolProposalLib);
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

  async function invest(amount, account) {
    const receptions = await traderPool.getInvestTokens(amount);
    await traderPool.invest(amount, receptions.receivedAmounts, { from: account });
  }

  async function reinvestCommission(offset, limit) {
    const commissions = await traderPool.getReinvestCommissions(offset, limit);
    await traderPool.reinvestCommission(offset, limit, commissions.dexeDexeCommission);
  }

  async function exchangeFromExact(from, to, amount) {
    const exchange = await traderPool.getExchangeFromExactAmount(from, to, amount, []);
    await traderPool.exchangeFromExact(from, to, amount, exchange, []);
  }

  async function exchangeToExact(from, to, amount) {
    const exchange = await traderPool.getExchangeToExactAmount(from, to, amount, []);
    await traderPool.exchangeToExact(from, to, amount, exchange, []);
  }

  async function createProposal(value, limits) {
    const divests = await traderPool.getDivestAmountsAndCommissions(OWNER, value);

    await traderPool.createProposal("placeholder.com", value, limits, divests.receptions.receivedAmounts);
  }

  async function investProposal(proposalId, amount, account) {
    const divests = await traderPool.getDivestAmountsAndCommissions(account, amount);

    await traderPool.investProposal(proposalId, amount, divests.receptions.receivedAmounts, { from: account });
  }

  async function reinvestProposal(propoaslId, account) {
    const divests = await proposalPool.getRewards([propoaslId], account);
    const invests = await traderPool.getInvestTokens(divests.baseAmount);

    await traderPool.reinvestProposal(propoaslId, invests.receivedAmounts, { from: account });
  }

  async function convertToDividends(proposalId) {
    await proposalPool.convertToDividends(proposalId);
  }

  async function withdrawProposal(proposalId, amount) {
    await proposalPool.withdraw(proposalId, amount);
  }

  async function claimProposal(proposalId, account) {
    await proposalPool.claim(proposalId, { from: account });
  }

  async function supplyProposal(proposalId, amount) {
    await proposalPool.supply(proposalId, amount);
  }

  async function reinvestAllProposals(account) {
    const length = await proposalPool.getTotalActiveInvestments(account);
    const activeProposals = await proposalPool.getActiveInvestmentsInfo(account, 0, length);

    const proposals = activeProposals.map((prop) => prop.proposalId);

    const divests = await proposalPool.getRewards(proposals, account);
    const invests = await traderPool.getInvestTokens(divests.baseAmount);

    await traderPool.reinvestAllProposals(invests.receivedAmounts, { from: account });
  }

  describe("Default Pool", () => {
    let POOL_PARAMETERS = {};

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
        await truffleAssert.reverts(invest(wei("100"), SECOND), "ITP: investment delay");
      });

      it("should revert when investing with delay", async () => {
        await tokens.WETH.approve(traderPool.address, wei("100"));

        await invest(wei("100"), OWNER);
        await exchangeToExact(tokens.WETH.address, tokens.USDT.address, wei("100"));

        await truffleAssert.reverts(invest(wei("100"), SECOND), "ITP: investment delay");
      });

      it("should invest after delay", async () => {
        await tokens.WETH.approve(traderPool.address, wei("100"));

        await invest(wei("100"), OWNER);
        await exchangeFromExact(tokens.WETH.address, tokens.USDT.address, wei("100"));

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await truffleAssert.passes(invest(wei("100"), SECOND), "Invested");
      });
    });

    describe("createProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);
      });

      it("should create a proposal", async () => {
        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));

        const time = toBN(await getCurrentBlockTime());

        await createProposal(wei("100"), [time.plus(100000), wei("10000")]);

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("100"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("100"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("900"));
      });

      it("should create 2 proposals", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal(wei("100"), [time.plus(100000), wei("10000")]);
        await createProposal(wei("100"), [time.plus(100000), wei("10000")]);

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
        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
      });

      it("should invest into the proposal", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal(wei("100"), [time.plus(10000000), wei("10000")]);

        await exchangeFromExact(tokens.WETH.address, tokens.USDT.address, wei("100"));
        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await invest(wei("1000"), SECOND);
        await investProposal(1, wei("500"), SECOND);

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

      it("should calculate the commission correctly after the proposal investment", async () => {
        await tokens.WETH.approve(uniswapV2Router.address, toBN(wei("10000000")));
        await tokens.USDT.approve(uniswapV2Router.address, toBN(wei("10000000", 6)));

        await exchangeFromExact(tokens.WETH.address, tokens.USDT.address, wei("100"));

        await uniswapV2Router.setReserve(tokens.WETH.address, toBN(wei("1000000")));
        await uniswapV2Router.setReserve(tokens.USDT.address, toBN(wei("1000000", 6)));

        await exchangeToExact(tokens.USDT.address, tokens.WETH.address, wei("100"));

        await uniswapV2Router.setReserve(tokens.WETH.address, toBN(wei("1000000")));

        const time = toBN(await getCurrentBlockTime());
        await createProposal(wei("500"), [time.plus(100000000), wei("10000")]);

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await invest(wei("1000"), SECOND);
        await investProposal(1, wei("500"), SECOND);

        await exchangeToExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        await uniswapV2Router.setReserve(tokens.MANA.address, toBN(wei("500000")));
        await uniswapV2Router.setReserve(tokens.WETH.address, toBN(wei("1000000")));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("500"));

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_MONTH);

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("500"));

        const commissions = await traderPool.getReinvestCommissions(0, 5);
        await reinvestCommission(0, 5);

        assert.equal(toBN(commissions.traderBaseCommission).toFixed(), wei("52.5"));
        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          toBN(wei("535")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
      });
    });

    describe("withdrawProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
      });

      it("should withdraw the deposit", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal(wei("100"), [time.plus(10000000), wei("10000")]);

        await exchangeFromExact(tokens.WETH.address, tokens.USDT.address, wei("100"));
        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await invest(wei("1000"), SECOND);
        await investProposal(1, wei("500"), SECOND);

        let info = await proposalPool.proposalInfos(1);
        assert.closeTo(info.newInvestedBase.toNumber(), toBN(wei("600")).toNumber(), toBN(wei("1")).toNumber());

        assert.equal((await tokens.WETH.balanceOf(OWNER)).toFixed(), wei("998999000"));

        await withdrawProposal(1, wei("600"));

        assert.equal((await tokens.WETH.balanceOf(OWNER)).toFixed(), wei("998999600"));

        info = await proposalPool.proposalInfos(1);
        assert.closeTo(info.newInvestedBase.toNumber(), toBN(wei("0")).toNumber(), toBN(wei("1")).toNumber());
      });
    });

    describe("claimProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });

        const time = toBN(await getCurrentBlockTime());

        await createProposal(wei("100"), [time.plus(10000000), wei("10000")]);

        await exchangeFromExact(tokens.WETH.address, tokens.USDT.address, wei("100"));
        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await invest(wei("1000"), SECOND);
        await investProposal(1, wei("500"), SECOND);
      });

      it("should claim the deposit", async () => {
        await withdrawProposal(1, wei("600"));

        await tokens.WETH.approve(proposalPool.address, wei("60"));
        await supplyProposal(1, wei("60"));

        assert.equal((await tokens.WETH.balanceOf(SECOND)).toFixed(), "0");

        await claimProposal(1, SECOND);

        const proposalInfo = (await proposalPool.getActiveInvestmentsInfo(SECOND, 0, 10))[0];

        assert.closeTo(
          (await tokens.WETH.balanceOf(SECOND)).toNumber(),
          toBN(wei("50")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(proposalInfo.lpInvested).toNumber(),
          toBN(wei("450")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await truffleAssert.reverts(claimProposal(1, SECOND), "TPIP: nothing to claim");
      });

      it("should claim huge deposit successfully", async () => {
        await tokens.WETH.approve(proposalPool.address, wei("6000"));
        await supplyProposal(1, wei("6000"));

        await claimProposal(1, SECOND);

        const proposalInfo = (await proposalPool.getActiveInvestmentsInfo(SECOND, 0, 10))[0];

        assert.closeTo(
          (await tokens.WETH.balanceOf(SECOND)).toNumber(),
          toBN(wei("5000")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.equal(toBN(proposalInfo.lpInvested).toFixed(), "0");
      });

      it("should claim the deposit twice", async () => {
        await withdrawProposal(1, wei("600"));

        await tokens.WETH.approve(proposalPool.address, wei("1000"));

        await supplyProposal(1, wei("600"));
        await claimProposal(1, SECOND);

        assert.closeTo(
          (await tokens.WETH.balanceOf(SECOND)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await supplyProposal(1, wei("400"));
        await claimProposal(1, SECOND);

        assert.closeTo(
          (await tokens.WETH.balanceOf(SECOND)).toNumber(),
          toBN(wei("833")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });
    });

    describe("reinvestProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });

        const time = toBN(await getCurrentBlockTime());

        await createProposal(wei("100"), [time.plus(10000000), wei("10000")]);

        await exchangeFromExact(tokens.WETH.address, tokens.USDT.address, wei("100"));
        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await invest(wei("1000"), SECOND);
        await investProposal(1, wei("500"), SECOND);
      });

      it("should reinvest proposal", async () => {
        assert.closeTo(
          (await traderPool.balanceOf(SECOND)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          (await proposalPool.balanceOf(SECOND, 1)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await convertToDividends(1);
        await reinvestProposal(1, SECOND);

        assert.closeTo(
          (await traderPool.balanceOf(SECOND)).toNumber(),
          toBN(wei("1000")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          (await proposalPool.balanceOf(SECOND, 1)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await truffleAssert.reverts(reinvestProposal(1, SECOND), "TPIP: nothing to claim");
      });

      it("should reinvest all proposals", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal(wei("200"), [time.plus(10000000), wei("5000")]);
        await investProposal(2, wei("400"), SECOND);

        await convertToDividends(1);
        await convertToDividends(2);

        assert.closeTo(
          (await traderPool.balanceOf(SECOND)).toNumber(),
          toBN(wei("100")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          (await proposalPool.balanceOf(SECOND, 1)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          (await proposalPool.balanceOf(SECOND, 2)).toNumber(),
          toBN(wei("400")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await reinvestAllProposals(SECOND);

        assert.closeTo(
          (await traderPool.balanceOf(SECOND)).toNumber(),
          toBN(wei("1000")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          (await proposalPool.balanceOf(SECOND, 1)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          (await proposalPool.balanceOf(SECOND, 2)).toNumber(),
          toBN(wei("400")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await truffleAssert.reverts(reinvestAllProposals(SECOND), "TPIP: nothing to claim");
      });
    });
  });
});
