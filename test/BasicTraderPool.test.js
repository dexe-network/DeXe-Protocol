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
const BasicTraderPool = artifacts.require("BasicTraderPool");
const PoolProposal = artifacts.require("TraderPoolRiskyProposal");
const PoolProposalLib = artifacts.require("TraderPoolRiskyProposalView");
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
BasicTraderPool.numberFormat = "BigNumber";
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

describe("BasicTraderPool", () => {
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
        await coreProperties.addWhitelistTokens([tokens[tokenNames[i]].address]);
      }

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

    await BasicTraderPool.link(traderPoolCommissionLib);
    await BasicTraderPool.link(traderPoolLeverageLib);
    await BasicTraderPool.link(traderPoolPriceLib);
    await BasicTraderPool.link(traderPoolViewLib);

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
    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

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
    await traderPoolRegistry.__PoolContractsRegistry_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.INSURANCE_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.TRADER_POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());

    await configureBaseTokens();
  });

  async function deployPool(poolParameters) {
    const POOL_NAME = await traderPoolRegistry.BASIC_POOL_NAME();

    const traderPool = await BasicTraderPool.new();
    const proposal = await PoolProposal.new();

    const parentPoolInfo = {
      parentPoolAddress: traderPool.address,
      trader: poolParameters.trader,
      baseToken: poolParameters.baseToken,
      baseTokenDecimals: poolParameters.baseTokenDecimals,
    };

    await traderPool.__BasicTraderPool_init("Test pool", "TP", poolParameters, proposal.address);
    await proposal.__TraderPoolRiskyProposal_init(parentPoolInfo);

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
    const exchange = (await traderPool.getExchangeFromExactAmount(from, to, amount, []))[0];
    await traderPool.exchangeFromExact(from, to, amount, exchange, []);
  }

  async function exchangeToExact(from, to, amount) {
    const exchange = (await traderPool.getExchangeToExactAmount(from, to, amount, []))[0];
    await traderPool.exchangeToExact(from, to, amount, exchange, []);
  }

  async function createProposal(token, value, limits, percentage) {
    const divests = await traderPool.getDivestAmountsAndCommissions(OWNER, value);
    const creationTokens = (
      await proposalPool.getCreationTokens(token, divests.receptions.baseAmount, percentage, [])
    )[0];

    await traderPool.createProposal(
      token,
      value,
      limits,
      percentage,
      divests.receptions.receivedAmounts,
      creationTokens,
      []
    );
  }

  async function investProposal(proposalId, amount, account) {
    const divests = await traderPool.getDivestAmountsAndCommissions(account, amount);
    const invests = await proposalPool.getInvestTokens(proposalId, divests.receptions.baseAmount);

    await traderPool.investProposal(proposalId, amount, divests.receptions.receivedAmounts, invests.positionAmount, {
      from: account,
    });
  }

  async function exchangeFromExactProposal(proposalId, from, amount) {
    const amountOut = (await proposalPool.getExchangeFromExactAmount(proposalId, from, amount, []))[0];
    await proposalPool.exchangeFromExact(proposalId, from, amount, amountOut, []);
  }

  async function exchangeToExactProposal(proposalId, from, amount) {
    const amountOut = (await proposalPool.getExchangeToExactAmount(proposalId, from, amount, []))[0];
    await proposalPool.exchangeToExact(proposalId, from, amount, amountOut, []);
  }

  async function reinvestProposal(propoaslId, amount, account) {
    const divests = await proposalPool.getDivestAmounts([propoaslId], [amount]);
    const invests = await traderPool.getInvestTokens(divests.baseAmount);

    await traderPool.reinvestProposal(propoaslId, amount, invests.receivedAmounts, divests.receivedAmounts[0], {
      from: account,
    });
  }

  async function reinvestAllProposals(slippage, account) {
    const length = await proposalPool.getTotalActiveInvestments(account);
    const activeProposals = await proposalPool.getActiveInvestmentsInfo(account, 0, length);

    const proposals = activeProposals.map((prop) => prop.proposalId);
    const amounts = activeProposals.map((prop) => prop.lp2Balance);

    const divests = await proposalPool.getDivestAmounts(proposals, amounts);
    const invests = await traderPool.getInvestTokens(divests.baseAmount);

    const slippageAmounts = divests.receivedAmounts.map((amount) => toBN(amount).times(slippage).dp(0).toFixed());

    await traderPool.reinvestAllProposals(invests.receivedAmounts, slippageAmounts, { from: account });
  }

  describe("Default Pool", () => {
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

      [traderPool, proposalPool] = await deployPool(POOL_PARAMETERS);
    });

    describe("exchange", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));

        await invest(wei("1000"), OWNER);
      });

      it("should not exchange not whitelisted token", async () => {
        await truffleAssert.reverts(
          exchangeFromExact(tokens.WETH.address, tokens.WBTC.address, wei("500")),
          "BTP: invalid exchange"
        );
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

        const divests = await traderPool.getDivestAmountsAndCommissions(OWNER, wei("100"));
        const creationTokens = await proposalPool.getCreationTokens(
          tokens.MANA.address,
          divests.receptions.baseAmount,
          0,
          []
        );

        assert.equal(toBN(creationTokens.positionTokens).toFixed(), "0");
        assert.equal(toBN(creationTokens.positionTokenPrice).toFixed(), wei("1"));

        await createProposal(tokens.MANA.address, wei("100"), [time.plus(100000), wei("10000"), wei("2")], 0);

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("100"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("100"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("900"));
      });

      it("should create a proposal 2", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        await tokens.MANA.approve(uniswapV2Router.address, wei("1000000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        const time = toBN(await getCurrentBlockTime());

        await createProposal(tokens.MANA.address, wei("300"), [time.plus(100000), wei("10000"), wei("2")], 0);

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("300"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("300"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("700"));
      });

      it("should create a proposal 3", async () => {
        await exchangeToExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        await tokens.MANA.approve(uniswapV2Router.address, wei("1000000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        const time = toBN(await getCurrentBlockTime());

        await createProposal(
          tokens.WBTC.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(50)
        );

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("500"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("500"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("500"));

        assert.equal((await tokens.MANA.balanceOf(traderPool.address)).toFixed(), wei("250"));
        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("250"));

        assert.closeTo(
          (await tokens.WBTC.balanceOf(proposalPool.address)).toNumber(),
          toBN(wei("250", 8)).toNumber(),
          toBN(wei("1", 8)).toNumber()
        );
        assert.equal((await tokens.WETH.balanceOf(proposalPool.address)).toFixed(), wei("250"));

        const proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.equal(toBN(proposalInfo.balanceBase).toFixed(), wei("250"));
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });

      it("should create two proposals", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal(tokens.MANA.address, wei("100"), [time.plus(100000), wei("10000"), wei("2")], 0);
        await createProposal(tokens.WBTC.address, wei("100"), [time.plus(100000), wei("1000"), wei("20")], 0);

        await truffleAssert.reverts(
          createProposal(tokens.WETH.address, wei("100"), [time.plus(1000), wei("1000"), wei("2")], 0),
          "BTP: wrong proposal token"
        );

        assert.equal((await proposalPool.proposalsTotalNum()).toFixed(), "2");
      });
    });

    describe("investProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));

        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
      });

      it("should invest into proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(tokens.MANA.address, wei("500"), [time.plus(10000), wei("5000"), wei("1.5")], 0);

        await invest(wei("1000"), SECOND);

        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("1000"));

        await investProposal(1, wei("100"), SECOND);

        assert.equal((await proposalPool.balanceOf(SECOND, 1)).toFixed(), wei("100"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("600"));
        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("900"));

        const proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.equal(toBN(proposalInfo.balanceBase).toFixed(), wei("600"));
        assert.equal(toBN(proposalInfo.balancePosition).toFixed(), "0");
      });

      it("should invest into proposal 2", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        await tokens.MANA.approve(uniswapV2Router.address, wei("1000000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        const time = toBN(await getCurrentBlockTime());

        await createProposal(
          tokens.WBTC.address,
          wei("500"),
          [time.plus(100000), wei("20000"), wei("3")],
          PRECISION.times(50)
        );

        let proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await invest(wei("1000"), SECOND);

        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("1000"));
        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("750"));
        assert.equal((await tokens.MANA.balanceOf(traderPool.address)).toFixed(), wei("750"));

        const limitsTrader = (await proposalPool.getUserInvestmentsLimits(OWNER, [1])).map((el) => el.toFixed());

        assert.deepEqual(limitsTrader, [toBN(2).pow(256).minus(1).toFixed()]);

        const limitsInvestor = (await proposalPool.getUserInvestmentsLimits(SECOND, [1])).map((el) => el.toFixed());

        assert.deepEqual(limitsInvestor, [wei("500")]);

        await investProposal(1, wei("100"), SECOND);

        assert.closeTo(
          (await proposalPool.balanceOf(SECOND, 1)).toNumber(),
          toBN(wei("100")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("600"));
        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("900"));

        proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("300")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("300")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });

      it("trader should divest and then invest into the proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(tokens.MANA.address, wei("500"), [time.plus(10000), wei("5000"), wei("1.5")], 0);

        await reinvestProposal(1, wei("500"), OWNER);

        await investProposal(1, wei("100"), OWNER);

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("100"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("100"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("900"));
      });

      it("investor should divest and then invest into the proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(tokens.MANA.address, wei("500"), [time.plus(10000), wei("5000"), wei("1.5")], 0);

        await reinvestProposal(1, wei("500"), OWNER);

        await invest(wei("1000"), SECOND);

        const limitsInvestor = (await proposalPool.getUserInvestmentsLimits(SECOND, [1])).map((el) => el.toFixed());
        assert.deepEqual(limitsInvestor, ["0"]);

        await truffleAssert.reverts(investProposal(1, wei("100"), SECOND), "TPRP: investing more than trader");
      });

      it("should calculate the commission correctly after the proposal investment", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          tokens.WBTC.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(50)
        );

        await invest(wei("1000"), SECOND);
        await investProposal(1, wei("500"), SECOND);

        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("500"));

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_MONTH);

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("500"));

        const commissions = await traderPool.getReinvestCommissions(0, 5);
        await reinvestCommission(0, 5);

        assert.equal(toBN(commissions.traderBaseCommission).toFixed(), wei("87.5"));
        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          toBN(wei("558.3333333")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
      });

      it("should be able to invest 100% of the funds", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          tokens.WBTC.address,
          wei("1000"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(50)
        );

        await tokens.WBTC.approve(uniswapV2Router.address, wei("1000000", 8));

        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.WBTC.address, wei("1000000", 8));

        await invest(wei("1000"), SECOND);
        await investProposal(1, wei("1000"), SECOND);

        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), "0");
        assert.equal((await traderPool.totalInvestors()).toFixed(), "1");

        assert.equal((await proposalPool.balanceOf(SECOND, 1)).toFixed(), wei("1000"));

        await proposalPool.safeTransferFrom(SECOND, OWNER, 1, wei("1000"), "0x", { from: SECOND });

        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), "0");
        assert.equal((await proposalPool.getTotalActiveInvestments(SECOND)).toFixed(), "0");
        assert.equal((await proposalPool.balanceOf(SECOND, 1)).toFixed(), "0");
        assert.equal((await traderPool.totalInvestors()).toFixed(), "0");
      });

      it("shouldn't invest into the proposal when the price is too high", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(tokens.MANA.address, wei("500"), [time.plus(100000), wei("10000"), wei("2")], 0);

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("400000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await invest(wei("1000"), SECOND);

        await truffleAssert.reverts(investProposal(1, wei("100"), SECOND), "TPRP: token price too high");
      });

      it("shouldn't invest more than trader", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal(tokens.MANA.address, wei("100"), [time.plus(100000), wei("1500"), 0], 0);

        await invest(wei("1000"), SECOND);

        await truffleAssert.reverts(investProposal(1, wei("1000"), SECOND), "TPRP: investing more than trader");
      });
    });

    describe("divestProposal", async () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));

        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
      });

      it("should create and then divest from proposal", async () => {
        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));

        const time = toBN(await getCurrentBlockTime());
        await createProposal(tokens.MANA.address, wei("500"), [time.plus(100000), wei("10000"), wei("2")], 0);

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("500"));

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("500"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("500"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("500"));

        assert.equal((await proposalPool.totalSupply(1)).toFixed(), wei("500"));

        let info = (await proposalPool.getActiveInvestmentsInfo(OWNER, 0, 1))[0];

        assert.equal(toBN(info.lpLocked).toFixed(), wei("500"));

        await reinvestProposal(1, wei("250"), OWNER);

        info = (await proposalPool.getActiveInvestmentsInfo(OWNER, 0, 1))[0];

        assert.equal(toBN(info.lpLocked).toFixed(), wei("250"));

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("250"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("250"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("750"));

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("750"));
      });

      it("should create, invest and divest from proposal", async () => {
        await exchangeToExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          tokens.WBTC.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(50)
        );

        await invest(wei("1000"), SECOND);
        await investProposal(1, wei("100"), SECOND);

        assert.closeTo(
          (await proposalPool.balanceOf(SECOND, 1)).toNumber(),
          toBN(wei("100")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("600"));
        assert.closeTo(
          (await traderPool.balanceOf(SECOND)).toNumber(),
          toBN(wei("900")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        let proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("300")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("300")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        const balance = await proposalPool.balanceOf(SECOND, 1);
        await reinvestProposal(1, balance, SECOND);

        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("500"));
        assert.closeTo(
          (await traderPool.balanceOf(SECOND)).toNumber(),
          toBN(wei("1000")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });

      it("should divest from all proposals", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        await invest(wei("1000"), SECOND);

        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          tokens.WBTC.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(50)
        );

        await investProposal(1, wei("400"), SECOND);

        await createProposal(
          tokens.DEXE.address,
          wei("400"),
          [time.plus(10000), wei("1000"), wei("2")],
          PRECISION.times(75)
        );

        await investProposal(2, wei("300"), SECOND);

        assert.closeTo(
          (await proposalPool.totalLockedLP()).toNumber(),
          toBN(wei("1600")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        let proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("450")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("450")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        proposalInfo = (await proposalPool.getProposalInfos(1, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("175")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("525")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await reinvestAllProposals("0.99", SECOND);

        assert.closeTo(
          (await proposalPool.totalLockedLP()).toNumber(),
          toBN(wei("900")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        assert.closeTo(
          (await traderPool.balanceOf(SECOND)).toNumber(),
          toBN(wei("1000")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        proposalInfo = (await proposalPool.getProposalInfos(1, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("100")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("300")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });
    });

    describe("exchangeProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));

        await invest(wei("1000"), OWNER);
      });

      it("should exchange in proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(tokens.MANA.address, wei("500"), [time.plus(100000), wei("10000"), wei("2")], 0);

        let proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.equal(toBN(proposalInfo.balancePosition).toFixed(), "0");

        await exchangeFromExactProposal(1, tokens.WETH.address, wei("250"));

        proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });

      it("should exchange from proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          tokens.MANA.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(80)
        );

        await exchangeFromExactProposal(1, tokens.MANA.address, wei("400"));

        let proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.equal(toBN(proposalInfo.balancePosition).toFixed(), "0");
      });
    });

    describe("token transfer", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });

        const time = toBN(await getCurrentBlockTime());

        await createProposal(tokens.MANA.address, wei("1000"), [time.plus(10000000), wei("10000"), wei("2")], 0);

        await invest(wei("500"), SECOND);
        await investProposal(1, wei("500"), SECOND);
      });

      it("should add new investor through transfer", async () => {
        assert.equal((await traderPool.totalInvestors()).toFixed(), "1");

        let infoSecond = (await proposalPool.getActiveInvestmentsInfo(SECOND, 0, 1))[0];

        assert.equal(toBN(infoSecond.lpLocked).toFixed(), wei("500"));

        await proposalPool.safeTransferFrom(SECOND, THIRD, 1, wei("250"), [], { from: SECOND });

        infoSecond = (await proposalPool.getActiveInvestmentsInfo(SECOND, 0, 1))[0];
        const infoThird = (await proposalPool.getActiveInvestmentsInfo(THIRD, 0, 1))[0];

        assert.equal((await traderPool.totalInvestors()).toFixed(), "2");

        assert.closeTo(toBN(infoSecond.lpLocked).toNumber(), toBN(wei("250")).toNumber(), toBN(wei("0.1")).toNumber());
        assert.closeTo(toBN(infoThird.lpLocked).toNumber(), toBN(wei("250")).toNumber(), toBN(wei("0.1")).toNumber());
      });

      it("should add new and remove old investor", async () => {
        assert.equal((await traderPool.totalInvestors()).toFixed(), "1");

        const infoSecond = (await proposalPool.getActiveInvestmentsInfo(SECOND, 0, 1))[0];

        assert.equal(toBN(infoSecond.lpLocked).toFixed(), wei("500"));

        await proposalPool.safeTransferFrom(SECOND, THIRD, 1, (await proposalPool.balanceOf(SECOND, 1)).toFixed(), [], {
          from: SECOND,
        });

        const infoThird = (await proposalPool.getActiveInvestmentsInfo(THIRD, 0, 1))[0];

        assert.equal((await traderPool.totalInvestors()).toFixed(), "1");

        assert.equal(toBN(infoThird.lpLocked).toFixed(), wei("500"));
      });
    });
  });
});
