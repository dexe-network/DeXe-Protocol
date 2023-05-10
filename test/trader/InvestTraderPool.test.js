const { toBN, accounts, wei } = require("../../scripts/utils/utils");
const { setTime, getCurrentBlockTime } = require("../helpers/block-helper");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { SECONDS_IN_DAY, SECONDS_IN_MONTH, PRECISION } = require("../../scripts/utils/constants");
const { ExchangeType, ComissionPeriods, DEFAULT_CORE_PROPERTIES } = require("../utils/constants");
const { assert } = require("chai");
const { setCode } = require("@nomicfoundation/hardhat-network-helpers");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const Insurance = artifacts.require("Insurance");
const ERC20Mock = artifacts.require("ERC20Mock");
const BABTMock = artifacts.require("BABTMock");
const ReentrantCallerMock = artifacts.require("ReentrantCallerMock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeedMock = artifacts.require("PriceFeedMock");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const PoolRegistry = artifacts.require("PoolRegistry");
const InvestTraderPool = artifacts.require("InvestTraderPool");
const PoolProposal = artifacts.require("TraderPoolInvestProposal");
const PoolProposalLib = artifacts.require("TraderPoolInvestProposalView");
const TraderPoolCommissionLib = artifacts.require("TraderPoolCommission");
const TraderPoolLeverageLib = artifacts.require("TraderPoolLeverage");
const TraderPoolExchangeLib = artifacts.require("TraderPoolExchange");
const TraderPoolPriceLib = artifacts.require("TraderPoolPrice");
const TraderPoolInvestLib = artifacts.require("TraderPoolInvest");
const TraderPoolDivestLib = artifacts.require("TraderPoolDivest");
const TraderPoolModifyLib = artifacts.require("TraderPoolModify");
const TraderPoolViewLib = artifacts.require("TraderPoolView");

ContractsRegistry.numberFormat = "BigNumber";
Insurance.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeedMock.numberFormat = "BigNumber";
UniswapV2RouterMock.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
InvestTraderPool.numberFormat = "BigNumber";
PoolProposal.numberFormat = "BigNumber";
BABTMock.numberFormat = "BigNumber";

describe("InvestTraderPool", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let FACTORY;
  let NOTHING;

  let insurance;
  let DEXE;
  let USD;
  let babt;
  let coreProperties;
  let priceFeed;
  let uniswapV2Router;
  let poolRegistry;
  let tokens = {};

  let traderPool;
  let proposalPool;

  const reverter = new Reverter();

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

    await TraderPoolDivestLib.link(traderPoolCommissionLib);

    await TraderPoolInvestLib.link(traderPoolPriceLib);
    await TraderPoolInvestLib.link(traderPoolLeverageLib);

    await TraderPoolViewLib.link(traderPoolPriceLib);
    await TraderPoolViewLib.link(traderPoolCommissionLib);
    await TraderPoolViewLib.link(traderPoolLeverageLib);

    const traderPoolViewLib = await TraderPoolViewLib.new();
    const traderPoolExchangeLib = await TraderPoolExchangeLib.new();
    const traderPoolInvestLib = await TraderPoolInvestLib.new();
    const traderPoolDivestLib = await TraderPoolDivestLib.new();
    const traderPoolModifyLib = await TraderPoolModifyLib.new();

    await InvestTraderPool.link(traderPoolCommissionLib);
    await InvestTraderPool.link(traderPoolExchangeLib);
    await InvestTraderPool.link(traderPoolInvestLib);
    await InvestTraderPool.link(traderPoolDivestLib);
    await InvestTraderPool.link(traderPoolModifyLib);
    await InvestTraderPool.link(traderPoolViewLib);

    const poolProposalLib = await PoolProposalLib.new();

    await PoolProposal.link(poolProposalLib);

    const contractsRegistry = await ContractsRegistry.new();
    const _insurance = await Insurance.new();
    DEXE = await ERC20Mock.new("DEXE", "DEXE", 18);
    USD = await ERC20Mock.new("USD", "USD", 18);
    babt = await BABTMock.new();
    const _coreProperties = await CoreProperties.new();
    const _priceFeed = await PriceFeedMock.new();
    uniswapV2Router = await UniswapV2RouterMock.new();
    const _poolRegistry = await PoolRegistry.new();

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.INSURANCE_NAME(), _insurance.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);

    await contractsRegistry.addContract(await contractsRegistry.DEXE_NAME(), DEXE.address);
    await contractsRegistry.addContract(await contractsRegistry.USD_NAME(), USD.address);
    await contractsRegistry.addContract(await contractsRegistry.BABT_NAME(), babt.address);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_ROUTER_NAME(), uniswapV2Router.address);
    await contractsRegistry.addContract(await contractsRegistry.POOL_FACTORY_NAME(), FACTORY);

    await contractsRegistry.addContract(await contractsRegistry.TREASURY_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.DIVIDENDS_NAME(), NOTHING);
    await contractsRegistry.addContract(await contractsRegistry.UNISWAP_V2_FACTORY_NAME(), NOTHING);

    insurance = await Insurance.at(await contractsRegistry.getInsuranceContract());
    coreProperties = await CoreProperties.at(await contractsRegistry.getCorePropertiesContract());
    priceFeed = await PriceFeedMock.at(await contractsRegistry.getPriceFeedContract());
    poolRegistry = await PoolRegistry.at(await contractsRegistry.getPoolRegistryContract());

    await insurance.__Insurance_init();
    await coreProperties.__CoreProperties_init(DEFAULT_CORE_PROPERTIES);
    await priceFeed.__PriceFeed_init();
    await poolRegistry.__OwnablePoolContractsRegistry_init();

    await contractsRegistry.injectDependencies(await contractsRegistry.INSURANCE_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.PRICE_FEED_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.POOL_REGISTRY_NAME());
    await contractsRegistry.injectDependencies(await contractsRegistry.CORE_PROPERTIES_NAME());

    await configureBaseTokens();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  async function deployPool(poolParameters) {
    const POOL_NAME = await poolRegistry.INVEST_POOL_NAME();

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

    await poolRegistry.addProxyPool(POOL_NAME, traderPool.address, {
      from: FACTORY,
    });
    await poolRegistry.associateUserWithPool(OWNER, POOL_NAME, traderPool.address, {
      from: FACTORY,
    });

    await poolRegistry.injectDependenciesToExistingPools(POOL_NAME, 0, 10);

    return [traderPool, proposal];
  }

  async function invest(amount, account) {
    const receptions = await traderPool.getInvestTokens(amount);
    await traderPool.invest(amount, receptions.receivedAmounts, { from: account });
  }

  async function reinvestCommission(offsetLimits) {
    const commissions = await traderPool.getReinvestCommissions(offsetLimits);
    await traderPool.reinvestCommission(offsetLimits, commissions.dexeDexeCommission);
  }

  async function exchangeFromExact(from, to, amount) {
    const exchange = (await traderPool.getExchangeAmount(from, to, amount, [], ExchangeType.FROM_EXACT))[0];
    await traderPool.exchange(from, to, amount, exchange, [], ExchangeType.FROM_EXACT);
  }

  async function exchangeToExact(from, to, amount) {
    const exchange = (await traderPool.getExchangeAmount(from, to, amount, [], ExchangeType.TO_EXACT))[0];
    await traderPool.exchange(from, to, amount, exchange, [], ExchangeType.TO_EXACT);
  }

  async function createProposal(value, limits) {
    const divests = await traderPool.getDivestAmountsAndCommissions(OWNER, value);

    await traderPool.createProposal("placeholder.com", value, limits, divests.receptions.receivedAmounts);
  }

  async function investProposal(proposalId, amount, account) {
    const divests = await traderPool.getDivestAmountsAndCommissions(account, amount);

    await traderPool.investProposal(proposalId, amount, divests.receptions.receivedAmounts, { from: account });
  }

  async function reinvestProposal(proposalId, account) {
    const divests = await proposalPool.getRewards([proposalId], account);
    const invests = await traderPool.getInvestTokens(divests.baseAmountFromRewards);

    await traderPool.reinvestProposal(proposalId, invests.receivedAmounts, { from: account });
  }

  async function convertToDividends(proposalId) {
    await proposalPool.convertInvestedBaseToDividends(proposalId);
  }

  async function withdrawProposal(proposalId, amount) {
    await proposalPool.withdraw(proposalId, amount);
  }

  async function supplyProposal(proposalId, amounts, tokens) {
    await proposalPool.supply(proposalId, amounts, tokens);
  }

  describe("Default Pool", () => {
    let POOL_PARAMETERS = {};

    beforeEach("Pool parameters", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: false,
        onlyBABTHolders: false,
        totalLPEmission: 0,
        baseToken: tokens.WETH.address,
        baseTokenDecimals: 18,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(30).times(PRECISION).toFixed(),
        traderBABTId: 0,
      };

      [traderPool, proposalPool] = await deployPool(POOL_PARAMETERS);
    });

    describe("access", () => {
      it("should not initialize twice", async () => {
        await truffleAssert.reverts(
          traderPool.__InvestTraderPool_init("Test pool", "TP", POOL_PARAMETERS, OWNER),
          "Initializable: contract is already initialized"
        );

        await truffleAssert.reverts(
          proposalPool.__TraderPoolInvestProposal_init({
            parentPoolAddress: traderPool.address,
            trader: POOL_PARAMETERS.trader,
            baseToken: POOL_PARAMETERS.baseToken,
            baseTokenDecimals: POOL_PARAMETERS.baseTokenDecimals,
          }),
          "Initializable: contract is already initialized"
        );
      });

      it("should not set dependencies from non dependant", async () => {
        await truffleAssert.reverts(traderPool.setDependencies(OWNER), "Dependant: Not an injector");
      });

      it("only trader admin should call these methods", async () => {
        const time = toBN(await getCurrentBlockTime());

        await truffleAssert.reverts(
          proposalPool.changeProposalRestrictions(1, [time.plus(1000000), wei("1000")], { from: SECOND }),
          "TPP: not a trader admin"
        );

        await truffleAssert.reverts(proposalPool.withdraw(1, wei("1"), { from: SECOND }), "TPP: not a trader admin");
        await truffleAssert.reverts(
          proposalPool.supply(1, [wei("1")], [OWNER], { from: SECOND }),
          "TPP: not a trader admin"
        );
        await truffleAssert.reverts(
          proposalPool.convertInvestedBaseToDividends(1, { from: SECOND }),
          "TPP: not a trader admin"
        );
      });

      it("only trader should call these methods", async () => {
        const time = toBN(await getCurrentBlockTime());

        await truffleAssert.reverts(
          traderPool.createProposal("placeholder", wei("100"), [time.plus(100000), wei("10000")], [], { from: SECOND }),
          "TP: not a trader"
        );
      });

      it("only parent pool should call these methods", async () => {
        const time = toBN(await getCurrentBlockTime());

        await truffleAssert.reverts(
          proposalPool.create("placeholder", [time.plus(100000), wei("10000")], wei("100"), wei("100")),
          "TPP: not a ParentPool"
        );

        await truffleAssert.reverts(proposalPool.invest(1, OWNER, wei("100"), wei("100")), "TPP: not a ParentPool");

        await truffleAssert.reverts(proposalPool.divest(1, OWNER), "TPP: not a ParentPool");
      });

      it("only proposal pool should call these methods", async () => {
        await truffleAssert.reverts(traderPool.checkLeave(OWNER), "ITP: not a proposal");
        await truffleAssert.reverts(traderPool.checkJoin(OWNER), "ITP: not a proposal");
      });
    });

    describe("proposal getters", () => {
      it("should not fail", async () => {
        await truffleAssert.passes(proposalPool.getBaseToken(), "passes");
        await truffleAssert.passes(proposalPool.getInvestedBaseInUSD(), "passes");
        await truffleAssert.passes(proposalPool.getTotalActiveInvestments(NOTHING), "passes");
        await truffleAssert.passes(proposalPool.getProposalInfos(0, 10), "passes");
        await truffleAssert.passes(proposalPool.getActiveInvestmentsInfo(NOTHING, 0, 10), "passes");
        await truffleAssert.passes(proposalPool.getRewards([0, 10], NOTHING), "passes");
      });
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

      it("should invest rightaway if delay is not set", async () => {
        await coreProperties.setDelayForRiskyPool(0);

        await tokens.WETH.approve(traderPool.address, wei("100"));

        await invest(wei("100"), OWNER);

        await truffleAssert.passes(invest(wei("100"), SECOND), "Invested");
      });

      it("should not invest into closed proposals", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await exchangeFromExact(tokens.WETH.address, tokens.USDT.address, wei("100"));
        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        const time = toBN(await getCurrentBlockTime());

        await invest(wei("1000"), SECOND);

        await createProposal(wei("500"), [time.plus(2), wei("5000")]);
        await createProposal(wei("500"), [time.plus(1000), wei("500")]);

        await truffleAssert.reverts(investProposal(3, wei("100"), SECOND), "TPIP: proposal doesn't exist");
        await truffleAssert.reverts(investProposal(1, wei("100"), SECOND), "TPIP: proposal is closed");
        await truffleAssert.reverts(investProposal(2, wei("100"), SECOND), "TPIP: proposal is overinvested");
      });

      it("should be allowed to invest into proposal with no limits", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await createProposal(wei("500"), [0, 0]);

        await truffleAssert.passes(investProposal(1, wei("500"), OWNER), "pass");
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

      it("should not create proposals with incorrect data", async () => {
        const time = toBN(await getCurrentBlockTime());

        await truffleAssert.reverts(createProposal(wei("100"), [time.minus(1), wei("10000")]), "TPIP: wrong timestamp");

        await truffleAssert.reverts(
          createProposal(wei("100"), [time.plus(100), wei("10")]),
          "TPIP: wrong investment limit"
        );

        await truffleAssert.reverts(createProposal(0, [time.plus(100000), wei("10")], 0, 0), "TPIP: zero investment");
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

      it("should change proposal's restrictions", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal(wei("100"), [time.plus(100000), wei("10000")]);

        let info = (await proposalPool.getProposalInfos(0, 1))[0];

        assert.equal(info.proposalInfo.proposalLimits.timestampLimit, time.plus(100000));
        assert.equal(info.proposalInfo.proposalLimits.investLPLimit, wei("10000"));

        await proposalPool.changeProposalRestrictions(1, [time.plus(1000000), wei("100000")]);

        await truffleAssert.reverts(
          proposalPool.changeProposalRestrictions(2, [time.plus(1000000), wei("1000")]),
          "TPIP: proposal doesn't exist"
        );

        info = (await proposalPool.getProposalInfos(0, 1))[0];

        assert.equal(info.proposalInfo.proposalLimits.timestampLimit, time.plus(1000000));
        assert.equal(info.proposalInfo.proposalLimits.investLPLimit, wei("100000"));
      });
    });

    describe("investProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
      });

      it("should revert when investing before exchange", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal(wei("100"), [time.plus(10000000), wei("10000")]);

        await truffleAssert.reverts(investProposal(1, wei("100"), SECOND), "ITP: investment delay");
      });

      it("should revert when investing with delay", async () => {
        const time = toBN(await getCurrentBlockTime());

        await tokens.WETH.approve(traderPool.address, wei("100"));

        await createProposal(wei("100"), [time.plus(10000000), wei("10000")]);
        await investProposal(1, wei("100"), OWNER);

        await exchangeToExact(tokens.WETH.address, tokens.USDT.address, wei("100"));

        await truffleAssert.reverts(investProposal(1, wei("100"), SECOND), "ITP: investment delay");
      });

      it("should revert if reentrant call", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal(wei("100"), [time.plus(10000000), wei("10000")]);

        await exchangeFromExact(tokens.WETH.address, tokens.USDT.address, wei("100"));
        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await invest(wei("1000"), SECOND);

        const divests = await traderPool.getDivestAmountsAndCommissions(SECOND, wei("500"));

        const baseTokenAddress = tokens.WETH.address;
        const bytecode = await (await ReentrantCallerMock.new()).getBytecode();

        await setCode(baseTokenAddress, bytecode);

        const callbackAddress = traderPool.address;
        const callbackData = traderPool.contract.methods.investProposal(0, 0, []).encodeABI();

        await (await ReentrantCallerMock.at(baseTokenAddress)).setCallback(callbackAddress, callbackData);

        await truffleAssert.reverts(
          traderPool.investProposal(1, wei("500"), divests.receptions.receivedAmounts, { from: SECOND }),
          "ReentrancyGuard: reentrant call"
        );
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
        await tokens.WETH.approve(uniswapV2Router.address, wei("10000000"));
        await tokens.USDT.approve(uniswapV2Router.address, wei("10000000", 6));

        await exchangeFromExact(tokens.WETH.address, tokens.USDT.address, wei("100"));

        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.USDT.address, wei("1000000", 6));

        await exchangeToExact(tokens.USDT.address, tokens.WETH.address, wei("100"));

        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        const time = toBN(await getCurrentBlockTime());
        await createProposal(wei("500"), [time.plus(100000000), wei("10000")]);

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await invest(wei("1000"), SECOND);
        await investProposal(1, wei("500"), SECOND);

        await exchangeToExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("500"));

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_MONTH);

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("500"));

        const commissions = await traderPool.getReinvestCommissions([0, 5]);
        await reinvestCommission([0, 5]);

        assert.equal(toBN(commissions.traderBaseCommission).toFixed(), wei("52.5"));
        assert.equal(toBN(commissions.traderLPCommission).toFixed(), wei("35"));
        assert.closeTo(
          toBN(commissions.traderUSDCommission).toNumber(),
          toBN(wei("52.5525")).toNumber(),
          toBN(wei("0.001")).toNumber()
        );
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

        let info = (await proposalPool.getProposalInfos(0, 1))[0];
        assert.equal(toBN(info.totalInvestors).toFixed(), "1");
        assert.equal(toBN(info.lp2Supply).toFixed(), toBN(info.proposalInfo.investedBase).toFixed());
        assert.closeTo(
          toBN(info.proposalInfo.newInvestedBase).toNumber(),
          toBN(wei("600")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        assert.equal((await tokens.WETH.balanceOf(OWNER)).toFixed(), wei("998999000"));

        await withdrawProposal(1, wei("600"));

        assert.equal((await tokens.WETH.balanceOf(OWNER)).toFixed(), wei("998999600"));

        info = (await proposalPool.getProposalInfos(0, 1))[0];

        assert.equal(toBN(info.totalInvestors).toFixed(), "1");
        assert.closeTo(
          toBN(info.proposalInfo.newInvestedBase).toNumber(),
          toBN(wei("0")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await truffleAssert.reverts(withdrawProposal(1, wei("9000")), "TPIP: withdrawing more than balance");
      });

      it("should check withdrawal in proposal", async () => {
        await truffleAssert.reverts(withdrawProposal(2, wei("900")), "TPIP: proposal doesn't exist");
      });
    });

    describe("supplyProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        const time = toBN(await getCurrentBlockTime());

        await createProposal(wei("100"), [time.plus(10000000), wei("10000")]);
      });

      it("should supply into the proposal", async () => {
        await tokens.WETH.approve(proposalPool.address, wei("100"));
        await supplyProposal(1, [wei("50")], [tokens.WETH.address]);

        await tokens.MANA.approve(proposalPool.address, wei("100"));
        await supplyProposal(1, [wei("50"), wei("100")], [tokens.WETH.address, tokens.MANA.address]);
      });

      it("should check supply in proposal", async () => {
        await truffleAssert.reverts(
          supplyProposal(2, [wei("50"), wei("50")], [tokens.WETH.address, tokens.MANA.address]),
          "TPIP: proposal doesn't exist"
        );

        await truffleAssert.reverts(
          supplyProposal(1, [wei("50")], [tokens.WETH.address, tokens.MANA.address]),
          "TPIP: length mismatch"
        );

        await truffleAssert.reverts(supplyProposal(1, [0], [tokens.WETH.address]), "TPIP: amount is 0");
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

        await withdrawProposal(1, wei("600"));
      });

      it("should claim the deposit", async () => {
        await tokens.MANA.approve(proposalPool.address, wei("60"));
        await supplyProposal(1, [wei("60")], [tokens.MANA.address]);

        assert.equal((await tokens.MANA.balanceOf(SECOND)).toFixed(), "0");

        await reinvestProposal(1, SECOND);

        const proposalInfo = (await proposalPool.getActiveInvestmentsInfo(SECOND, 0, 10))[0];

        assert.closeTo(
          (await tokens.MANA.balanceOf(SECOND)).toNumber(),
          toBN(wei("50")).toNumber(),
          toBN(wei("0.01")).toNumber()
        );
        assert.equal(toBN(proposalInfo.lpInvested).toFixed(), wei("500"));
        assert.closeTo(
          toBN(proposalInfo.baseInvested).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("0.1")).toNumber()
        );

        await truffleAssert.reverts(reinvestProposal(1, SECOND), "TPIP: nothing to divest");
      });

      it("should claim huge deposit successfully", async () => {
        await tokens.MANA.approve(proposalPool.address, wei("6000"));
        await supplyProposal(1, [wei("6000")], [tokens.MANA.address]);

        await reinvestProposal(1, SECOND);

        const proposalInfo = (await proposalPool.getActiveInvestmentsInfo(SECOND, 0, 10))[0];

        assert.closeTo(
          (await tokens.MANA.balanceOf(SECOND)).toNumber(),
          toBN(wei("5000")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.equal(toBN(proposalInfo.lpInvested).toFixed(), wei("500"));
      });

      it("should claim the deposit twice", async () => {
        await tokens.MANA.approve(proposalPool.address, wei("1000"));
        await supplyProposal(1, [wei("600")], [tokens.MANA.address]);

        await reinvestProposal(1, SECOND);

        assert.closeTo(
          (await tokens.MANA.balanceOf(SECOND)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await supplyProposal(1, [wei("400")], [tokens.MANA.address]);

        await reinvestProposal(1, SECOND);

        assert.closeTo(
          (await tokens.MANA.balanceOf(SECOND)).toNumber(),
          toBN(wei("833")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });

      it("should claim all the supplied tokens", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.DEXE.approve(proposalPool.address, wei("50"));
        await tokens.MANA.approve(proposalPool.address, wei("100"));

        await supplyProposal(1, [wei("50"), wei("100")], [tokens.DEXE.address, tokens.MANA.address]);

        await tokens.WETH.mint(THIRD, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: THIRD });

        await invest(wei("1000"), THIRD);
        await investProposal(1, wei("500"), THIRD);

        const rewards = (await proposalPool.getRewards([1], SECOND)).rewards[0];

        assert.equal(rewards.tokens[0], tokens.DEXE.address);
        assert.equal(rewards.tokens[1], tokens.MANA.address);

        assert.closeTo(
          toBN(rewards.amounts[0]).toNumber(),
          toBN(wei("41.666")).toNumber(),
          toBN(wei("0.001")).toNumber()
        );
        assert.closeTo(
          toBN(rewards.amounts[1]).toNumber(),
          toBN(wei("83.333")).toNumber(),
          toBN(wei("0.001")).toNumber()
        );

        await reinvestProposal(1, SECOND);

        assert.closeTo(
          (await tokens.DEXE.balanceOf(SECOND)).toNumber(),
          toBN(wei("41.666")).toNumber(),
          toBN(wei("0.001")).toNumber()
        );
        assert.closeTo(
          (await tokens.MANA.balanceOf(SECOND)).toNumber(),
          toBN(wei("83.333")).toNumber(),
          toBN(wei("0.001")).toNumber()
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

        await truffleAssert.reverts(reinvestProposal(1, SECOND), "TPIP: nothing to divest");
        await truffleAssert.reverts(reinvestProposal(2, SECOND), "TPIP: proposal doesn't exist");
      });

      it("should check reinvest in proposal", async () => {
        await truffleAssert.reverts(convertToDividends(2), "TPIP: proposal doesn't exist");
        await truffleAssert.reverts(reinvestProposal(1, OWNER), "TPIP: nothing to divest");
      });

      it("should reinvest huge proposal", async () => {
        await tokens.WETH.approve(proposalPool.address, wei("6000"));
        await supplyProposal(1, [wei("6000")], [tokens.WETH.address]);

        await truffleAssert.passes(reinvestProposal(1, SECOND), "reinvested");
      });

      it("should reinvest proposal with extra rewards", async () => {
        assert.closeTo(
          (await traderPool.balanceOf(SECOND)).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await tokens.WETH.approve(proposalPool.address, wei("100"));
        await tokens.MANA.approve(proposalPool.address, wei("500"));

        await supplyProposal(1, [wei("100"), wei("500")], [tokens.WETH.address, tokens.MANA.address]);

        await convertToDividends(1);
        await reinvestProposal(1, SECOND);

        assert.closeTo(
          (await traderPool.balanceOf(SECOND)).toNumber(),
          toBN(wei("1083.333")).toNumber(),
          toBN(wei("0.1")).toNumber()
        );

        assert.closeTo(
          (await tokens.MANA.balanceOf(SECOND)).toNumber(),
          toBN(wei("416.666")).toNumber(),
          toBN(wei("0.1")).toNumber()
        );
      });

      it("should sequentially reinvest all proposals", async () => {
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

        await reinvestProposal(1, SECOND);
        await reinvestProposal(2, SECOND);

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

        await truffleAssert.reverts(reinvestProposal(1, SECOND), "TPIP: nothing to divest");
      });
    });

    describe("token transfer", () => {
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

      it("should add new investor through transfer", async () => {
        assert.equal((await traderPool.totalInvestors()).toFixed(), "1");

        let infoSecond = (await proposalPool.getActiveInvestmentsInfo(SECOND, 0, 1))[0];

        assert.equal(toBN(infoSecond.baseInvested).toFixed(), toBN(infoSecond.lp2Balance).toFixed());
        assert.equal(toBN(infoSecond.lpInvested).toFixed(), wei("500"));

        await proposalPool.safeTransferFrom(SECOND, THIRD, 1, wei("250"), [], { from: SECOND });

        infoSecond = (await proposalPool.getActiveInvestmentsInfo(SECOND, 0, 1))[0];
        const infoThird = (await proposalPool.getActiveInvestmentsInfo(THIRD, 0, 1))[0];

        assert.equal((await traderPool.totalInvestors()).toFixed(), "2");

        assert.closeTo(
          toBN(infoSecond.lpInvested).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("0.1")).toNumber()
        );
        assert.closeTo(toBN(infoThird.lpInvested).toNumber(), toBN(wei("250")).toNumber(), toBN(wei("0.1")).toNumber());
      });

      it("should not share rewards after transfer", async () => {
        await convertToDividends(1);

        let rewardsSecond = (await proposalPool.getRewards([1], SECOND)).rewards[0];

        assert.closeTo(
          toBN(rewardsSecond.amounts[0]).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await proposalPool.safeTransferFrom(SECOND, THIRD, 1, wei("250"), [], { from: SECOND });

        rewardsSecond = (await proposalPool.getRewards([1], SECOND)).rewards[0];

        assert.closeTo(
          toBN(rewardsSecond.amounts[0]).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });

      it("should receive rewards after transfer", async () => {
        await convertToDividends(1);

        await proposalPool.safeTransferFrom(SECOND, THIRD, 1, wei("250"), [], { from: SECOND });

        let rewardsSecond = (await proposalPool.getRewards([1], SECOND)).rewards[0];

        assert.closeTo(
          toBN(rewardsSecond.amounts[0]).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        await tokens.WETH.approve(proposalPool.address, wei("600"));
        await supplyProposal(1, [wei("600")], [tokens.WETH.address]);

        rewardsSecond = (await proposalPool.getRewards([1], SECOND)).rewards[0];
        const rewardsThird = (await proposalPool.getRewards([1], THIRD)).rewards[0];

        assert.closeTo(
          toBN(rewardsSecond.amounts[0]).toNumber(),
          toBN(wei("750")).toNumber(),
          toBN(wei("1")).toNumber()
        );

        assert.closeTo(
          toBN(rewardsThird.amounts[0]).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });
    });

    describe("onlyBABTHolder modifier reverts", () => {
      const REVERT_STRING_TP = "TP: not BABT holder";
      const REVERT_STRING_TPP = "TPP: not BABT holder";

      beforeEach("setup", async () => {
        await babt.attest(SECOND);

        POOL_PARAMETERS.onlyBABTHolders = true;

        [traderPool, proposalPool] = await deployPool(POOL_PARAMETERS);
      });

      it("createProposal()", async () => {
        await truffleAssert.reverts(
          traderPool.createProposal("placeholder", wei("100"), [wei(100000), wei("10000")], []),
          REVERT_STRING_TP
        );
      });

      it("investProposal()", async () => {
        await truffleAssert.reverts(
          traderPool.investProposal(1, wei("10"), [wei(100000), wei("10000")]),
          REVERT_STRING_TP
        );
      });

      it("reinvestProposal()", async () => {
        await truffleAssert.reverts(traderPool.reinvestProposal(1, [wei(100000), wei("10000")]), REVERT_STRING_TP);
      });

      it("changeProposalRestrictions()", async () => {
        await truffleAssert.reverts(
          proposalPool.changeProposalRestrictions(1, [wei("1000000"), wei("1000")]),
          REVERT_STRING_TPP
        );
      });

      it("withdraw()", async () => {
        await truffleAssert.reverts(proposalPool.withdraw(1, wei("100")), REVERT_STRING_TPP);
      });

      it("supply()", async () => {
        await truffleAssert.reverts(proposalPool.supply(1, [wei("100")], [tokens.WETH.address]), REVERT_STRING_TPP);
      });

      it("convertInvestedBaseToDividends()", async () => {
        await truffleAssert.reverts(proposalPool.convertInvestedBaseToDividends(1), REVERT_STRING_TPP);
      });
    });
  });

  describe("Private pool", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: true,
        totalLPEmission: 0,
        baseToken: tokens.WETH.address,
        baseTokenDecimals: 18,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
        traderBABTId: 0,
      };

      [traderPool, proposalPool] = await deployPool(POOL_PARAMETERS);

      await traderPool.modifyPrivateInvestors([SECOND], true);
    });

    describe("remove private investor", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await tokens.WETH.approve(uniswapV2Router.address, wei("10000000"));
        await tokens.USDT.approve(uniswapV2Router.address, wei("10000000", 6));

        await invest(wei("1000"), OWNER);
        await exchangeFromExact(tokens.WETH.address, tokens.USDT.address, wei("100"));

        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.USDT.address, wei("1000000", 6));

        await exchangeFromExact(tokens.USDT.address, tokens.WETH.address, wei("100"));

        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.USDT.address, wei("1000000", 6));
      });

      it("should not remove private investor if they invested into proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(wei("1000"), [time.plus(10000000), wei("10000")]);

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_DAY * 20);

        await tokens.WETH.mint(SECOND, wei("500"));
        await tokens.WETH.approve(traderPool.address, wei("500"), { from: SECOND });

        await invest(wei("500"), SECOND);
        await investProposal(1, wei("500"), SECOND);

        assert.equal(toBN(await traderPool.balanceOf(SECOND)).toFixed(), "0");

        assert.isFalse(await traderPool.canRemovePrivateInvestor(SECOND));

        assert.equal(await traderPool.totalInvestors(), "1");

        await proposalPool.safeTransferFrom(SECOND, OWNER, 1, wei("500"), [], { from: SECOND });

        assert.equal(await traderPool.totalInvestors(), "0");

        assert.isTrue(await traderPool.canRemovePrivateInvestor(SECOND));
      });
    });
  });
});
