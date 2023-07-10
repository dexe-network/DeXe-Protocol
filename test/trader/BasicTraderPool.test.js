const { assert } = require("chai");
const { SECONDS_IN_MONTH, PRECISION, ZERO_ADDR } = require("../../scripts/utils/constants");
const { ExchangeType, ComissionPeriods, DEFAULT_CORE_PROPERTIES } = require("../utils/constants");
const { toBN, accounts, wei } = require("../../scripts/utils/utils");
const { setTime, getCurrentBlockTime } = require("../helpers/block-helper");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
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
const BasicTraderPool = artifacts.require("BasicTraderPool");
const PoolProposal = artifacts.require("TraderPoolRiskyProposal");
const PoolProposalLib = artifacts.require("TraderPoolRiskyProposalView");
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
BasicTraderPool.numberFormat = "BigNumber";
PoolProposal.numberFormat = "BigNumber";
BABTMock.numberFormat = "BigNumber";

describe("BasicTraderPool", () => {
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

  const defaultMinLPOut = toBN(1000000);

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
    await TraderPoolDivestLib.link(traderPoolPriceLib);

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

    await BasicTraderPool.link(traderPoolCommissionLib);
    await BasicTraderPool.link(traderPoolExchangeLib);
    await BasicTraderPool.link(traderPoolInvestLib);
    await BasicTraderPool.link(traderPoolDivestLib);
    await BasicTraderPool.link(traderPoolModifyLib);
    await BasicTraderPool.link(traderPoolViewLib);

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
    const POOL_NAME = await poolRegistry.BASIC_POOL_NAME();

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
    await traderPool.reinvestCommission(offsetLimits);
  }

  async function exchangeFromExact(from, to, amount) {
    const exchange = (await traderPool.getExchangeAmount(from, to, amount, [], ExchangeType.FROM_EXACT))[0];
    await traderPool.exchange(from, to, amount, exchange, [], ExchangeType.FROM_EXACT);
  }

  async function exchangeToExact(from, to, amount) {
    const exchange = (await traderPool.getExchangeAmount(from, to, amount, [], ExchangeType.TO_EXACT))[0];
    await traderPool.exchange(from, to, amount, exchange, [], ExchangeType.TO_EXACT);
  }

  async function createProposal(description, token, value, limits, percentage) {
    const divests = await traderPool.getDivestAmountsAndCommissions(OWNER, value);
    const creationTokens = (
      await proposalPool.getCreationTokens(token, divests.receptions.baseAmount, percentage, [])
    )[0];

    await traderPool.createProposal(
      description,
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
    const amountOut = (await proposalPool.getExchangeAmount(proposalId, from, amount, [], ExchangeType.FROM_EXACT))[0];
    await proposalPool.exchange(proposalId, from, amount, amountOut, [], ExchangeType.FROM_EXACT);
  }

  async function exchangeToExactProposal(proposalId, from, amount) {
    const amountOut = (await proposalPool.getExchangeAmount(proposalId, from, amount, [], ExchangeType.TO_EXACT))[0];
    await proposalPool.exchange(proposalId, from, amount, amountOut, [], ExchangeType.TO_EXACT);
  }

  async function reinvestProposal(propoaslId, amount, account) {
    const divests = await proposalPool.getDivestAmounts([propoaslId], [amount]);
    const invests = await traderPool.getInvestTokens(divests.baseAmount);

    await traderPool.reinvestProposal(propoaslId, amount, invests.receivedAmounts, divests.receivedAmounts[0], {
      from: account,
    });
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
        traderBABTId: 0,
      };

      [traderPool, proposalPool] = await deployPool(POOL_PARAMETERS);
    });

    describe("access", () => {
      it("should not initialize twice", async () => {
        await truffleAssert.reverts(
          traderPool.__BasicTraderPool_init("Test pool", "TP", POOL_PARAMETERS, OWNER),
          "Initializable: contract is already initialized"
        );

        await truffleAssert.reverts(
          proposalPool.__TraderPoolProposal_init({
            parentPoolAddress: traderPool.address,
            trader: POOL_PARAMETERS.trader,
            baseToken: POOL_PARAMETERS.baseToken,
            baseTokenDecimals: POOL_PARAMETERS.baseTokenDecimals,
          }),
          "Initializable: contract is not initializing"
        );

        await truffleAssert.reverts(
          proposalPool.__TraderPoolRiskyProposal_init({
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
        await truffleAssert.reverts(proposalPool.setDependencies(OWNER), "Dependant: Not an injector");
      });

      it("only trader admin should call these methods", async () => {
        const time = toBN(await getCurrentBlockTime());

        await truffleAssert.reverts(
          proposalPool.changeProposalRestrictions(1, [time.plus(1000000), wei("1000"), wei("10")], { from: SECOND }),
          "TPP: not a trader admin"
        );

        await truffleAssert.reverts(
          proposalPool.exchange(1, tokens.WETH.address, wei("1"), 0, [], ExchangeType.FROM_EXACT, { from: SECOND }),
          "TPP: not a trader admin"
        );
      });

      it("only parent pool should call these methods", async () => {
        const time = toBN(await getCurrentBlockTime());

        await truffleAssert.reverts(
          proposalPool.create(
            "description",
            tokens.MANA.address,
            [time.plus(100000), wei("10000"), wei("2")],
            wei("100"),
            wei("100"),
            0,
            0,
            []
          ),
          "TPP: not a ParentPool"
        );

        await truffleAssert.reverts(proposalPool.invest(1, OWNER, wei("100"), wei("100"), 0), "TPP: not a ParentPool");

        await truffleAssert.reverts(proposalPool.divest(1, OWNER, wei("100"), 0), "TPP: not a ParentPool");
      });

      it("only trader should call these methods", async () => {
        const time = toBN(await getCurrentBlockTime());

        await truffleAssert.reverts(
          traderPool.createProposal(
            "description",
            tokens.MANA.address,
            wei("100"),
            [time.plus(100000), wei("10000"), wei("2")],
            0,
            [],
            0,
            [],
            { from: SECOND }
          ),
          "TP: not a trader"
        );
      });

      it("only proposal pool should call these methods", async () => {
        await truffleAssert.reverts(traderPool.checkLeave(OWNER), "BTP: not a proposal");
        await truffleAssert.reverts(traderPool.checkJoin(OWNER), "BTP: not a proposal");
      });
    });

    describe("proposal getters", () => {
      it("should not fail", async () => {
        await truffleAssert.passes(proposalPool.getBaseToken(), "passes");
        await truffleAssert.passes(proposalPool.getInvestedBaseInUSD(), "passes");
        await truffleAssert.passes(proposalPool.getTotalActiveInvestments(NOTHING), "passes");
        await truffleAssert.passes(proposalPool.getProposalInfos(0, 10), "passes");
        await truffleAssert.passes(proposalPool.getActiveInvestmentsInfo(NOTHING, 0, 10), "passes");
        await truffleAssert.passes(proposalPool.getUserInvestmentsLimits(NOTHING, [0, 10]), "passes");
        await truffleAssert.passes(proposalPool.getCreationTokens(tokens.WETH.address, wei("10"), 0, []), "passes");
        await truffleAssert.passes(proposalPool.getCreationTokens(OWNER, wei("10"), 0, []), "passes");
        await truffleAssert.passes(proposalPool.getInvestTokens(1, wei("10")), "passes");
        await truffleAssert.passes(proposalPool.getInvestTokens(0, wei("10")), "passes");
        await truffleAssert.passes(proposalPool.getInvestmentPercentage(1, NOTHING, wei("10")), "passes");
        await truffleAssert.passes(proposalPool.getDivestAmounts([0, 1], [0, wei("10")]), "passes");
        await truffleAssert.passes(
          proposalPool.getExchangeAmount(1, tokens.MANA.address, wei("1"), [], ExchangeType.TO_EXACT),
          "passes"
        );
        await truffleAssert.passes(
          proposalPool.getExchangeAmount(0, tokens.MANA.address, wei("1"), [], ExchangeType.FROM_EXACT),
          "passes"
        );
      });
    });

    describe("investInitial", () => {
      it("should correctly invest tokens", async () => {
        await tokens.DEXE.approve(traderPool.address, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await tokens.USD.approve(traderPool.address, wei("1000"));

        await traderPool.investInitial(
          [wei("100"), wei("500"), wei("10")],
          [tokens.DEXE.address, tokens.WETH.address, tokens.USD.address],
          defaultMinLPOut
        );

        assert.equal((await tokens.DEXE.balanceOf(traderPool.address)).toFixed(), wei("100"));
        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("500"));
        assert.equal((await tokens.USD.balanceOf(traderPool.address)).toFixed(), wei("10"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("610"));

        const poolInfo = await traderPool.getPoolInfo();

        assert.deepEqual(poolInfo[3], [tokens.DEXE.address, tokens.USD.address]);
      });

      it("should revert when tokens are not in whitelist", async () => {
        await tokens.WBTC.mint(OWNER, wei("100"));
        await tokens.WBTC.approve(traderPool.address, wei("100"));

        await truffleAssert.reverts(
          traderPool.investInitial([wei("100")], [tokens.WBTC.address], defaultMinLPOut),
          "BP: not in whitelist"
        );
      });
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

      it("should be called only by an admin", async () => {
        const exchange = (
          await traderPool.getExchangeAmount(
            tokens.WETH.address,
            tokens.WBTC.address,
            wei("500"),
            [],
            ExchangeType.FROM_EXACT
          )
        )[0];
        await coreProperties.addWhitelistTokens([tokens.WBTC.address]);

        await truffleAssert.reverts(
          traderPool.exchange(
            tokens.WETH.address,
            tokens.WBTC.address,
            wei("500"),
            exchange,
            [],
            ExchangeType.FROM_EXACT,
            { from: SECOND }
          ),
          "TP: not an admin"
        );
      });
    });

    describe("createProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));

        await invest(wei("1000"), OWNER);
      });

      it("should create empty proposal", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal(
          "description",
          tokens.MANA.address,
          wei("100"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );
        await reinvestProposal(1, await proposalPool.balanceOf(OWNER, 1), OWNER);

        await truffleAssert.passes(proposalPool.getDivestAmounts([1], [0]), "pass");
      });

      it("should not create proposal if reentrant call", async () => {
        const time = toBN(await getCurrentBlockTime());

        const description = "description";
        const token = tokens.MANA.address;
        const value = wei("100");
        const limits = [time.plus(100000), wei("10000"), wei("2")];
        const percentage = 0;

        const divests = await traderPool.getDivestAmountsAndCommissions(OWNER, value);
        const creationTokens = (
          await proposalPool.getCreationTokens(token, divests.receptions.baseAmount, percentage, [])
        )[0];

        const bytecode = await (await ReentrantCallerMock.new()).getBytecode();

        const baseTokenAddress = tokens.WETH.address;
        await setCode(baseTokenAddress, bytecode);

        const callbackAddress = traderPool.address;
        const callbackData = traderPool.contract.methods
          .createProposal("", ZERO_ADDR, 0, [0, 0, 0], 0, [], 0, [])
          .encodeABI();

        await (await ReentrantCallerMock.at(baseTokenAddress)).setCallback(callbackAddress, callbackData);

        await truffleAssert.reverts(
          traderPool.createProposal(
            description,
            token,
            value,
            limits,
            percentage,
            divests.receptions.receivedAmounts,
            creationTokens,
            []
          ),
          "ReentrancyGuard: reentrant call"
        );
      });

      it("should not create proposals with incorrect data", async () => {
        const time = toBN(await getCurrentBlockTime());

        await truffleAssert.reverts(
          createProposal("description", OWNER, wei("100"), [time.plus(100000), wei("10000"), wei("2")], 0),
          "TPRP: not a contract"
        );

        await truffleAssert.reverts(
          createProposal("description", tokens.MANA.address, wei("100"), [time.minus(1), wei("10000"), wei("2")], 0),
          "TPRP: wrong timestamp"
        );

        await truffleAssert.reverts(
          createProposal("description", tokens.MANA.address, wei("100"), [time.plus(100), wei("10"), wei("2")], 0),
          "TPRP: wrong investment limit"
        );

        await truffleAssert.reverts(
          createProposal("description", tokens.MANA.address, 0, [time.plus(100000), wei("10"), wei("2")], 0),
          "TPRP: zero investment"
        );

        await truffleAssert.reverts(
          createProposal(
            "description",
            tokens.MANA.address,
            wei("1"),
            [time.plus(100000), wei("10"), wei("2")],
            wei(wei("10"))
          ),
          "TPRP: percentage is bigger than 100"
        );
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

        await createProposal(
          "description",
          tokens.MANA.address,
          wei("100"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );

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

        await createProposal(
          "description",
          tokens.MANA.address,
          wei("300"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );

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
          "description",
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

        await createProposal(
          "description",
          tokens.MANA.address,
          wei("100"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );
        await createProposal(
          "description",
          tokens.WBTC.address,
          wei("100"),
          [time.plus(100000), wei("1000"), wei("20")],
          0
        );

        await truffleAssert.reverts(
          createProposal("description", tokens.WETH.address, wei("100"), [time.plus(1000), wei("1000"), wei("2")], 0),
          "TPRP: wrong proposal token"
        );

        assert.equal((await proposalPool.proposalsTotalNum()).toFixed(), "2");
      });

      it("should change proposal's restrictions", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal(
          "description",
          tokens.MANA.address,
          wei("300"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );

        let info = (await proposalPool.getProposalInfos(0, 1))[0];

        assert.equal(info.proposalInfo.descriptionURL, "description");
        assert.equal(info.proposalInfo.proposalLimits.timestampLimit, time.plus(100000));
        assert.equal(info.proposalInfo.proposalLimits.maxTokenPriceLimit, wei("2"));

        await proposalPool.changeProposalRestrictions(1, [time.plus(1000000), wei("1000"), wei("10")]);

        await truffleAssert.reverts(
          proposalPool.changeProposalRestrictions(2, [time.plus(1000000), wei("1000"), wei("10")]),
          "TPRP: proposal doesn't exist"
        );
        await truffleAssert.reverts(
          proposalPool.changeProposalRestrictions(0, [time.plus(1000000), wei("1000"), wei("10")]),
          "TPRP: proposal doesn't exist"
        );

        info = (await proposalPool.getProposalInfos(0, 1))[0];

        assert.equal(info.proposalInfo.proposalLimits.timestampLimit, time.plus(1000000));
        assert.equal(info.proposalInfo.proposalLimits.maxTokenPriceLimit, wei("10"));
      });
    });

    describe("investProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));

        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
      });

      it("should not invest into closed proposals", async () => {
        const time = toBN(await getCurrentBlockTime());

        await invest(wei("1000"), SECOND);

        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(2), wei("5000"), wei("1.5")],
          0
        );
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(1000), wei("500"), wei("1.5")],
          0
        );

        await truffleAssert.reverts(investProposal(3, wei("100"), SECOND), "TPRP: proposal doesn't exist");
        await truffleAssert.reverts(investProposal(0, wei("100"), SECOND), "TPRP: proposal doesn't exist");
        await truffleAssert.reverts(investProposal(1, wei("100"), SECOND), "TPRP: proposal is closed");
        await truffleAssert.reverts(investProposal(2, wei("100"), SECOND), "TPRP: proposal is overinvested");
      });

      it("should not invest into proposal if reentrant call", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(10000), wei("5000"), wei("1.5")],
          0
        );

        await invest(wei("1000"), SECOND);

        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("1000"));

        const divests = await traderPool.getDivestAmountsAndCommissions(SECOND, wei("100"));
        const invests = await proposalPool.getInvestTokens(1, divests.receptions.baseAmount);

        const baseTokenAddress = tokens.WETH.address;
        const bytecode = await (await ReentrantCallerMock.new()).getBytecode();

        await setCode(baseTokenAddress, bytecode);

        const callbackAddress = traderPool.address;
        const callbackData = traderPool.contract.methods.investProposal(0, 0, [], 0).encodeABI();

        await (await ReentrantCallerMock.at(baseTokenAddress)).setCallback(callbackAddress, callbackData);

        await truffleAssert.reverts(
          traderPool.investProposal(1, wei("100"), divests.receptions.receivedAmounts, invests.positionAmount, {
            from: SECOND,
          }),
          "ReentrancyGuard: reentrant call"
        );
      });

      it("should invest into proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(10000), wei("5000"), wei("1.5")],
          0
        );

        await invest(wei("1000"), SECOND);

        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), wei("1000"));

        const divests = await traderPool.getDivestAmountsAndCommissions(SECOND, wei("100"));
        const invests = await proposalPool.getInvestTokens(1, divests.receptions.baseAmount);

        assert.equal(toBN(invests.baseAmount).toFixed(), wei("100"));
        assert.equal(toBN(invests.positionAmount).toFixed(), "0");
        assert.equal(toBN(invests.lp2Amount).toFixed(), wei("100"));

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
          "description",
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

      it("should be allowed to invest into proposal with no limits", async () => {
        await createProposal("description", tokens.MANA.address, wei("500"), [0, 0, 0], 0);

        await truffleAssert.passes(investProposal(1, wei("500"), OWNER), "pass");
      });

      it("trader should divest and then invest into the proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(10000), wei("5000"), wei("1.5")],
          0
        );

        await reinvestProposal(1, wei("500"), OWNER);

        await investProposal(1, wei("100"), OWNER);

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("100"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("100"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("900"));
      });

      it("investor should divest and then invest into the proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(10000), wei("5000"), wei("1.5")],
          0
        );

        await reinvestProposal(1, wei("500"), OWNER);

        await invest(wei("1000"), SECOND);

        const limitsInvestor = (await proposalPool.getUserInvestmentsLimits(SECOND, [1])).map((el) => el.toFixed());
        assert.deepEqual(limitsInvestor, ["0"]);

        await truffleAssert.reverts(investProposal(1, wei("100"), SECOND), "TPRP: investing more than trader");
      });

      it("should calculate the commission correctly after the proposal investment", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
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

        const commissions = await traderPool.getReinvestCommissions([0, 5]);
        await reinvestCommission([0, 5]);

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
          "description",
          tokens.WBTC.address,
          wei("1000"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(50)
        );

        await tokens.WBTC.approve(uniswapV2Router.address, wei("1000000", 8));

        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.WBTC.address, wei("1000000", 8));

        await invest(wei("1000"), SECOND);

        let info = (await proposalPool.getProposalInfos(0, 1))[0];
        assert.equal(toBN(info.totalInvestors).toFixed(), "0");

        await investProposal(1, wei("1000"), SECOND);

        info = (await proposalPool.getProposalInfos(0, 1))[0];
        assert.equal(toBN(info.totalInvestors).toFixed(), "1");

        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), "0");
        assert.equal((await traderPool.totalInvestors()).toFixed(), "1");

        assert.equal((await proposalPool.balanceOf(SECOND, 1)).toFixed(), wei("1000"));

        await proposalPool.safeTransferFrom(SECOND, OWNER, 1, wei("1000"), "0x", { from: SECOND });

        info = (await proposalPool.getProposalInfos(0, 1))[0];
        assert.equal(toBN(info.totalInvestors).toFixed(), "0");

        assert.equal((await traderPool.balanceOf(SECOND)).toFixed(), "0");
        assert.equal((await proposalPool.getTotalActiveInvestments(SECOND)).toFixed(), "0");
        assert.equal((await proposalPool.balanceOf(SECOND, 1)).toFixed(), "0");
        assert.equal((await traderPool.totalInvestors()).toFixed(), "0");
      });

      it("shouldn't invest into the proposal when the price is too high", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("400000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await invest(wei("1000"), SECOND);

        await truffleAssert.reverts(investProposal(1, wei("100"), SECOND), "TPRP: token price too high");
      });

      it("shouldn't invest more than trader", async () => {
        const time = toBN(await getCurrentBlockTime());

        await createProposal("description", tokens.MANA.address, wei("100"), [time.plus(100000), wei("1500"), 0], 0);

        await invest(wei("1000"), SECOND);

        await truffleAssert.reverts(investProposal(1, wei("1000"), SECOND), "TPRP: investing more than trader");
      });
    });

    describe("divestProposal", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));

        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
      });

      it("should not divest with wrong params", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.WBTC.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(50)
        );

        await invest(wei("1000"), SECOND);
        await investProposal(1, wei("500"), SECOND);

        await truffleAssert.reverts(reinvestProposal(2, wei("250"), OWNER), "TPRP: proposal doesn't exist");
        await truffleAssert.reverts(reinvestProposal(0, wei("250"), OWNER), "TPRP: proposal doesn't exist");
        await truffleAssert.reverts(reinvestProposal(1, wei("1000"), SECOND), "TPRP: divesting more than balance");
      });

      it("should create and then divest from proposal", async () => {
        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));

        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("500"));

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("500"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("500"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("500"));

        assert.equal((await proposalPool.totalSupply(1)).toFixed(), wei("500"));

        let info = (await proposalPool.getActiveInvestmentsInfo(OWNER, 0, 1))[0];

        assert.equal(toBN(info.lpInvested).toFixed(), wei("500"));
        assert.equal(toBN(info.baseInvested).toFixed(), wei("500"));

        await reinvestProposal(1, wei("250"), OWNER);

        info = (await proposalPool.getActiveInvestmentsInfo(OWNER, 0, 1))[0];

        assert.equal(toBN(info.lpInvested).toFixed(), wei("250"));
        assert.equal(toBN(info.baseInvested).toFixed(), wei("250"));

        assert.equal((await proposalPool.balanceOf(OWNER, 1)).toFixed(), wei("250"));
        assert.equal((await proposalPool.totalLockedLP()).toFixed(), wei("250"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("750"));

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("750"));
      });

      it("should create, invest and divest from proposal", async () => {
        await exchangeToExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.WBTC.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(50)
        );

        await invest(wei("1000"), SECOND);
        await investProposal(1, wei("100"), SECOND);

        await truffleAssert.reverts(reinvestProposal(1, wei("100"), OWNER), "TPRP: divesting with open position");

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

      it("should not reinvest if minProposalOut check not passed", async () => {
        await exchangeToExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.WBTC.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(50)
        );

        await uniswapV2Router.switchToNonLinear();

        await invest(wei("500"), SECOND);
        await investProposal(1, wei("100"), SECOND);

        const amount = await proposalPool.balanceOf(SECOND, 1);
        const divests = await proposalPool.getDivestAmounts([1], [amount]);
        const invests = await traderPool.getInvestTokens(divests.baseAmount);
        let wrongMinProposalOut = divests.receivedAmounts[0] + 1;

        await truffleAssert.reverts(
          traderPool.reinvestProposal(1, amount, invests.receivedAmounts, wrongMinProposalOut, { from: SECOND }),
          "TPRP: slippage"
        );
      });

      it("should not get profit from invest and then divest from proposal", async () => {
        await exchangeToExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.WBTC.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(50)
        );

        await uniswapV2Router.switchToNonLinear();

        await invest(wei("500"), SECOND);
        await investProposal(1, wei("100"), SECOND);

        await tokens.WETH.mint(THIRD, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: THIRD });
        await invest(wei("500"), THIRD);

        const balanceBefore = await traderPool.balanceOf(THIRD);

        await investProposal(1, wei("100"), THIRD);
        const balance = await proposalPool.balanceOf(THIRD, 1);
        await reinvestProposal(1, balance, THIRD);

        const balanceAfter = await traderPool.balanceOf(THIRD);

        assert.isTrue(balanceAfter.lt(balanceBefore));
      });

      it("should divest sequentially from all proposals", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("500"));

        await invest(wei("1000"), SECOND);

        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.WBTC.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(50)
        );

        await investProposal(1, wei("400"), SECOND);

        await createProposal(
          "description",
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

        await reinvestProposal(1, await proposalPool.balanceOf(SECOND, 1), SECOND);
        await reinvestProposal(2, await proposalPool.balanceOf(SECOND, 2), SECOND);

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

      it("should not exchange with wrong params", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );

        await truffleAssert.reverts(
          exchangeFromExactProposal(2, tokens.WETH.address, wei("250")),
          "TPRP: proposal doesn't exist"
        );

        await truffleAssert.reverts(
          exchangeFromExactProposal(0, tokens.WETH.address, wei("250")),
          "TPRP: proposal doesn't exist"
        );

        await truffleAssert.reverts(
          exchangeFromExactProposal(1, tokens.WETH.address, wei("1000")),
          "TPRP: wrong base amount"
        );

        await truffleAssert.reverts(
          exchangeFromExactProposal(1, tokens.MANA.address, wei("1000")),
          "TPRP: wrong position amount"
        );

        await truffleAssert.reverts(
          exchangeToExactProposal(1, tokens.WETH.address, wei("1000")),
          "TPRP: wrong base amount"
        );

        await truffleAssert.reverts(
          exchangeToExactProposal(1, tokens.MANA.address, wei("1000")),
          "TPRP: wrong position amount"
        );
      });

      it("should exchange from exact in proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );

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

      it("should exchange from exact from proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
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

      it("should exchange to exact in proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );

        let proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.equal(toBN(proposalInfo.balancePosition).toFixed(), "0");

        await exchangeToExactProposal(1, tokens.WETH.address, wei("250"));

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

      it("should exchange half position", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );

        await exchangeToExactProposal(1, tokens.WETH.address, wei("250"));
        await exchangeToExactProposal(1, tokens.MANA.address, wei("125"));

        proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("375")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("125")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });

      it("should exchange to exact from proposal", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(80)
        );

        await tokens.MANA.approve(uniswapV2Router.address, wei("1000000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeToExactProposal(1, tokens.MANA.address, wei("400"));

        let proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(
          toBN(proposalInfo.balanceBase).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );
        assert.equal(toBN(proposalInfo.balancePosition).toFixed(), "0");
      });

      it("should exchange in proposal twice", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );

        await tokens.MANA.approve(uniswapV2Router.address, wei("1000000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeToExactProposal(1, tokens.WETH.address, wei("400"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExactProposal(1, tokens.WETH.address, wei("100"));

        let proposalInfo = (await proposalPool.getProposalInfos(0, 1))[0].proposalInfo;

        assert.closeTo(toBN(proposalInfo.balanceBase).toNumber(), 0, toBN(wei("1")).toNumber());
        assert.closeTo(
          toBN(proposalInfo.balancePosition).toNumber(),
          toBN(wei("500")).toNumber(),
          toBN(wei("1")).toNumber()
        );
      });

      it("should not exchange random tokens", async () => {
        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("500"),
          [time.plus(100000), wei("10000"), wei("2")],
          PRECISION.times(80)
        );

        await tokens.MANA.approve(uniswapV2Router.address, wei("1000000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        const info = await proposalPool.getExchangeAmount(1, tokens.WBTC.address, wei("1"), [], ExchangeType.TO_EXACT);

        assert.equal(info[0], "0");
        assert.deepEqual(info[1], []);

        await truffleAssert.reverts(
          proposalPool.exchange(1, tokens.WBTC.address, wei("1"), 0, [], ExchangeType.FROM_EXACT),
          "TPRP: invalid from token"
        );
      });
    });

    describe("token transfer", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("1000"));
        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });

        const time = toBN(await getCurrentBlockTime());

        await createProposal(
          "description",
          tokens.MANA.address,
          wei("1000"),
          [time.plus(10000000), wei("10000"), wei("2")],
          0
        );

        await invest(wei("500"), SECOND);
        await investProposal(1, wei("500"), SECOND);
      });

      it("should not transfer 0 tokens", async () => {
        await truffleAssert.reverts(proposalPool.safeTransferFrom(OWNER, SECOND, 1, 0, []), "TPP: 0 transfer");
      });

      it("should add new investor through transfer", async () => {
        assert.equal((await traderPool.totalInvestors()).toFixed(), "1");

        let infoSecond = (await proposalPool.getActiveInvestmentsInfo(SECOND, 0, 1))[0];

        assert.equal(toBN(infoSecond.lpInvested).toFixed(), wei("500"));
        assert.equal(toBN(infoSecond.baseInvested).toFixed(), wei("500"));

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

        assert.closeTo(
          toBN(infoSecond.baseInvested).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("0.1")).toNumber()
        );
        assert.closeTo(
          toBN(infoThird.baseInvested).toNumber(),
          toBN(wei("250")).toNumber(),
          toBN(wei("0.1")).toNumber()
        );
      });

      it("should add new and remove old investor", async () => {
        assert.equal((await traderPool.totalInvestors()).toFixed(), "1");

        const infoSecond = (await proposalPool.getActiveInvestmentsInfo(SECOND, 0, 1))[0];

        assert.equal(toBN(infoSecond.lpInvested).toFixed(), wei("500"));

        await proposalPool.safeTransferFrom(SECOND, THIRD, 1, (await proposalPool.balanceOf(SECOND, 1)).toFixed(), [], {
          from: SECOND,
        });

        const infoThird = (await proposalPool.getActiveInvestmentsInfo(THIRD, 0, 1))[0];

        assert.equal((await traderPool.totalInvestors()).toFixed(), "1");

        assert.equal(toBN(infoThird.lpInvested).toFixed(), wei("500"));
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
          createProposal("description", tokens.MANA.address, wei("1000"), [wei("100000"), wei("10000"), wei("2")], 0),
          REVERT_STRING_TP
        );
      });

      it("investProposal()", async () => {
        await truffleAssert.reverts(traderPool.investProposal(1, wei("100"), [wei("100")], [0]), REVERT_STRING_TP);
      });

      it("reinvestProposal()", async () => {
        await truffleAssert.reverts(
          traderPool.reinvestProposal(1, wei("250"), [wei("250")], wei("250")),
          REVERT_STRING_TP
        );
      });

      it("changeProposalRestrictions()", async () => {
        await truffleAssert.reverts(
          proposalPool.changeProposalRestrictions(1, [wei("1000000"), wei("1000"), wei("10")]),
          REVERT_STRING_TPP
        );
      });

      it("exchange() in proposal", async () => {
        await truffleAssert.reverts(
          proposalPool.exchange(1, tokens.WETH.address, wei("100"), wei("100"), [], ExchangeType.FROM_EXACT),
          REVERT_STRING_TPP
        );
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
    });

    describe("remove private investor", () => {
      beforeEach("setup", async () => {
        await traderPool.modifyPrivateInvestors([SECOND], true);
      });

      it("should not remove private investor if they invested into proposal", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));

        await invest(wei("1000"), OWNER);

        await tokens.WETH.mint(SECOND, wei("500"));
        await tokens.WETH.approve(traderPool.address, wei("500"), { from: SECOND });

        await invest(wei("500"), SECOND);

        const time = toBN(await getCurrentBlockTime());
        await createProposal(
          "description",
          tokens.MANA.address,
          wei("1000"),
          [time.plus(100000), wei("10000"), wei("2")],
          0
        );

        await investProposal(1, wei("500"), SECOND);

        assert.equal(toBN(await traderPool.balanceOf(SECOND)).toFixed(), "0");

        assert.isFalse(await traderPool.canRemovePrivateInvestor(SECOND));
      });
    });
  });
});
