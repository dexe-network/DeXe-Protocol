const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/utils/utils");
const { setTime, getCurrentBlockTime } = require("./helpers/block-helper");
const truffleAssert = require("truffle-assertions");
const { SECONDS_IN_MONTH, PRECISION } = require("../scripts/utils/constants");
const { ExchangeType, ComissionPeriods, DEFAULT_CORE_PROPERTIES } = require("./utils/constants");

const ContractsRegistry = artifacts.require("ContractsRegistry");
const Insurance = artifacts.require("Insurance");
const ERC20Mock = artifacts.require("ERC20Mock");
const CoreProperties = artifacts.require("CoreProperties");
const PriceFeedMock = artifacts.require("PriceFeedMock");
const UniswapV2RouterMock = artifacts.require("UniswapV2RouterMock");
const PoolRegistry = artifacts.require("PoolRegistry");
const BundleMock = artifacts.require("BundleMock");
const TraderPoolMock = artifacts.require("TraderPoolMock");
const TraderPoolCommissionLib = artifacts.require("TraderPoolCommission");
const TraderPoolLeverageLib = artifacts.require("TraderPoolLeverage");
const TraderPoolExchangeLib = artifacts.require("TraderPoolExchange");
const TraderPoolPriceLib = artifacts.require("TraderPoolPrice");
const TraderPoolViewLib = artifacts.require("TraderPoolView");

ContractsRegistry.numberFormat = "BigNumber";
Insurance.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
CoreProperties.numberFormat = "BigNumber";
PriceFeedMock.numberFormat = "BigNumber";
UniswapV2RouterMock.numberFormat = "BigNumber";
PoolRegistry.numberFormat = "BigNumber";
BundleMock.numberFormat = "BigNumber";
TraderPoolMock.numberFormat = "BigNumber";

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
  let poolRegistry;
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

      await coreProperties.addWhitelistTokens([tokens[tokenNames[i]].address]);

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
    const traderPoolExchangeLib = await TraderPoolExchangeLib.new();

    await TraderPoolMock.link(traderPoolCommissionLib);
    await TraderPoolMock.link(traderPoolLeverageLib);
    await TraderPoolMock.link(traderPoolPriceLib);
    await TraderPoolMock.link(traderPoolExchangeLib);
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
    const _poolRegistry = await PoolRegistry.new();

    await contractsRegistry.__OwnableContractsRegistry_init();

    await contractsRegistry.addProxyContract(await contractsRegistry.INSURANCE_NAME(), _insurance.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.CORE_PROPERTIES_NAME(), _coreProperties.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.PRICE_FEED_NAME(), _priceFeed.address);
    await contractsRegistry.addProxyContract(await contractsRegistry.POOL_REGISTRY_NAME(), _poolRegistry.address);

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
  });

  async function deployPool(poolParameters) {
    const NAME = await poolRegistry.BASIC_POOL_NAME();

    const traderPool = await TraderPoolMock.new();

    await traderPool.__TraderPoolMock_init("Test pool", "TP", poolParameters);

    await poolRegistry.addProxyPool(NAME, traderPool.address, {
      from: FACTORY,
    });
    await poolRegistry.associateUserWithPool(OWNER, NAME, traderPool.address, {
      from: FACTORY,
    });

    await poolRegistry.injectDependenciesToExistingPools(NAME, 0, 10);

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

    describe("access", () => {
      it("should not initialize twice", async () => {
        await truffleAssert.reverts(
          traderPool.__TraderPool_init("Test pool", "TP", POOL_PARAMETERS),
          "Initializable: contract is not initializing"
        );
      });

      it("should not set dependencies from non dependant", async () => {
        await truffleAssert.reverts(traderPool.setDependencies(OWNER), "Dependant: Not an injector");
      });

      it("only admin should call these methods", async () => {
        await truffleAssert.reverts(traderPool.modifyAdmins([SECOND], true, { from: SECOND }), "TP: not an admin");

        await truffleAssert.reverts(
          traderPool.modifyPrivateInvestors([SECOND], true, { from: SECOND }),
          "TP: not an admin"
        );

        await truffleAssert.reverts(
          traderPool.changePoolParameters("placeholder", false, 0, 0, { from: SECOND }),
          "TP: not an admin"
        );

        await truffleAssert.reverts(traderPool.reinvestCommission([0, 10], 0, { from: SECOND }), "TP: not an admin");

        await truffleAssert.reverts(
          traderPool.exchange(tokens.WETH.address, tokens.WBTC.address, wei("500"), 0, [], ExchangeType.FROM_EXACT, {
            from: SECOND,
          }),
          "TP: not an admin"
        );
      });
    });

    describe("modifiers", () => {
      it("should modify admins", async () => {
        assert.isTrue(await traderPool.isTraderAdmin(OWNER));
        assert.isTrue(await traderPool.isTrader(OWNER));

        await traderPool.modifyAdmins([SECOND, THIRD], true);
        await traderPool.modifyAdmins([OWNER], false);

        assert.isTrue(await traderPool.isTraderAdmin(OWNER));
        assert.isTrue(await traderPool.isTraderAdmin(SECOND));
        assert.isTrue(await traderPool.isTraderAdmin(THIRD));

        await traderPool.modifyAdmins([SECOND, THIRD], false);

        assert.isFalse(await traderPool.isTraderAdmin(SECOND));
        assert.isFalse(await traderPool.isTraderAdmin(THIRD));
      });

      it("should modify private investors", async () => {
        await traderPool.modifyPrivateInvestors([SECOND, THIRD], true);

        assert.isFalse(await traderPool.isPrivateInvestor(OWNER));
        assert.isTrue(await traderPool.isPrivateInvestor(SECOND));
        assert.isTrue(await traderPool.isPrivateInvestor(THIRD));

        assert.isTrue(await traderPool.canRemovePrivateInvestor(SECOND));
        assert.isTrue(await traderPool.canRemovePrivateInvestor(THIRD));

        await traderPool.modifyPrivateInvestors([SECOND, THIRD], false);

        assert.isFalse(await traderPool.isPrivateInvestor(OWNER));
        assert.isFalse(await traderPool.isPrivateInvestor(SECOND));
      });

      it("should not remove private investor", async () => {
        await tokens.WETH.mint(SECOND, wei("1000"));

        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
        await invest(wei("1000"), SECOND);

        await traderPool.modifyPrivateInvestors([SECOND], true);
        await truffleAssert.reverts(traderPool.modifyPrivateInvestors([SECOND], false), "TP: can't remove investor");
      });

      it("should change pool parameters", async () => {
        let info = await traderPool.getPoolInfo();

        assert.equal(info.parameters.descriptionURL, "placeholder.com");
        assert.equal(info.parameters.baseToken, tokens.WETH.address);
        assert.equal(info.parameters.minimalInvestment, "0");

        await traderPool.changePoolParameters("example.com", false, 0, wei("10"));

        info = await traderPool.getPoolInfo();

        assert.equal(info.parameters.descriptionURL, "example.com");
        assert.equal(toBN(info.parameters.minimalInvestment).toFixed(), wei("10"));

        await traderPool.changePoolParameters("example.com", true, 0, wei("10"));

        info = await traderPool.getPoolInfo();

        assert.isTrue(info.parameters.privatePool);
      });

      it("should not change pool parameters", async () => {
        await tokens.WETH.mint(SECOND, wei("1000"));

        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });
        await invest(wei("1000"), SECOND);

        await truffleAssert.reverts(
          traderPool.changePoolParameters("example.com", false, wei("1"), wei("10")),
          "TP: wrong emission supply"
        );
        await truffleAssert.reverts(
          traderPool.changePoolParameters("example.com", true, wei("10000"), wei("10")),
          "TP: pool is not empty"
        );
      });
    });

    describe("getters", () => {
      it("should not revert", async () => {
        await truffleAssert.passes(traderPool.getPoolInfo(), "pass");
        await truffleAssert.passes(traderPool.canRemovePrivateInvestor(NOTHING), "pass");
        await truffleAssert.passes(traderPool.totalInvestors(), "pass");
        await truffleAssert.passes(traderPool.proposalPoolAddress(), "pass");
        await truffleAssert.passes(traderPool.totalEmission(), "pass");
        await truffleAssert.passes(traderPool.openPositions(), "pass");
        await truffleAssert.passes(traderPool.getUsersInfo(NOTHING, 0, 10), "pass");
        await truffleAssert.passes(traderPool.getLeverageInfo(), "pass");
        await truffleAssert.passes(traderPool.getInvestTokens(wei("1")), "pass");
        await truffleAssert.passes(traderPool.getReinvestCommissions([0, 10]), "pass");
        await truffleAssert.passes(traderPool.getNextCommissionEpoch(), "pass");
        await truffleAssert.passes(traderPool.getDivestAmountsAndCommissions(NOTHING, wei("10")), "pass");
        await truffleAssert.passes(
          traderPool.getExchangeAmount(tokens.MANA.address, tokens.WETH.address, wei("10"), [], ExchangeType.TO_EXACT),
          "pass"
        );
      });
    });

    describe("invest", () => {
      it("should invest", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        assert.isTrue((await traderPool.isTrader(OWNER)) && (await traderPool.isTraderAdmin(OWNER)));

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));

        await truffleAssert.passes(traderPool.getDivestAmountsAndCommissions(NOTHING, wei("10")), "pass");
      });

      it("should invest twice", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("500"), OWNER);

        await traderPool.changePoolParameters("example.com", false, wei("10000"), 0);

        await invest(wei("500"), OWNER);

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));
        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));
      });

      it("should not invest due to leverage", async () => {
        await tokens.WETH.mint(SECOND, wei("1000"));

        await tokens.WETH.approve(traderPool.address, wei("100"));
        await invest(wei("100"), OWNER);

        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: SECOND });

        await truffleAssert.reverts(invest(wei("1000"), SECOND), "TP: leverage exceeded");
      });

      it("should not invest if amount > emission", async () => {
        await traderPool.changePoolParameters("example.com", false, wei("1"), 0);

        await tokens.WETH.approve(traderPool.address, wei("100"));
        await truffleAssert.reverts(invest(wei("100"), OWNER), "TP: minting > emission");
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
        const investorSecondInfo = await traderPool.getUsersInfo(SECOND, 0, 2);

        assert.equal(investorInfo.investedBase.toFixed(), wei("1000"));
        assert.equal(
          investorInfo.commissionUnlockEpoch.toFixed(),
          toBN(await getCurrentBlockTime())
            .idiv(DEFAULT_CORE_PROPERTIES.traderParams.commissionDurations[POOL_PARAMETERS.commissionPeriod])
            .plus(1)
        );
        assert.equal(toBN(investorSecondInfo[2].poolLPBalance).toFixed(), wei("1000"));
        assert.equal(toBN(investorSecondInfo[2].investedBase).toFixed(), wei("1000"));
        assert.equal(toBN(investorSecondInfo[2].poolUSDShare).toFixed(), wei("1000"));
        assert.equal(toBN(investorSecondInfo[2].poolBaseShare).toFixed(), wei("1000"));

        assert.equal(toBN(investorSecondInfo[1].poolLPBalance).toFixed(), wei("1000"));
        assert.equal(toBN(investorSecondInfo[1].investedBase).toFixed(), "0");
        assert.equal(toBN(investorSecondInfo[1].poolUSDShare).toFixed(), wei("1000"));
        assert.equal(toBN(investorSecondInfo[1].poolBaseShare).toFixed(), wei("1000"));

        assert.deepEqual(investorSecondInfo[0], investorSecondInfo[2]);
      });
    });

    describe("exchange", () => {
      beforeEach("setup", async () => {
        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);
      });

      it("should not exchange tokens > supply", async () => {
        await truffleAssert.reverts(
          traderPool.exchange(tokens.WETH.address, tokens.WBTC.address, wei("5000"), 0, [], ExchangeType.FROM_EXACT),
          "TP: invalid exchange amount"
        );
      });

      it("should not exchange wrong tokens", async () => {
        await truffleAssert.reverts(
          traderPool.exchange(OWNER, tokens.WBTC.address, wei("50"), 0, [], ExchangeType.FROM_EXACT),
          "TP: invalid exchange address"
        );
      });

      it("should not exchange if positions > max", async () => {
        await coreProperties.setMaximumOpenPositions(0);

        await truffleAssert.reverts(
          traderPool.exchange(tokens.WETH.address, tokens.WBTC.address, wei("500"), 0, [], ExchangeType.FROM_EXACT),
          "TP: max positions"
        );
      });

      it("should not exchange these tokens", async () => {
        await truffleAssert.reverts(
          exchangeFromExact(tokens.WETH.address, tokens.WETH.address, wei("500")),
          "TP: ambiguous exchange"
        );
      });

      it("should exchange from exact tokens", async () => {
        await uniswapV2Router.setReserve(tokens.WBTC.address, wei("500000", 8));

        const exchange = (
          await traderPool.getExchangeAmount(
            tokens.WETH.address,
            tokens.WBTC.address,
            wei("500"),
            [],
            ExchangeType.FROM_EXACT
          )
        )[0];

        assert.equal(exchange.toFixed(), wei("250"));

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));

        await traderPool.exchange(
          tokens.WETH.address,
          tokens.WBTC.address,
          wei("500"),
          exchange,
          [],
          ExchangeType.FROM_EXACT
        );

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("500"));
        assert.equal((await tokens.WBTC.balanceOf(traderPool.address)).toFixed(), wei("250", 8));
      });

      it("should exchange to exact tokens", async () => {
        await uniswapV2Router.setReserve(tokens.WBTC.address, wei("500000", 8));

        const exchange = (
          await traderPool.getExchangeAmount(
            tokens.WETH.address,
            tokens.WBTC.address,
            wei("250"),
            [],
            ExchangeType.TO_EXACT
          )
        )[0];

        assert.equal(exchange.toFixed(), wei("500"));

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("1000"));

        await traderPool.exchange(
          tokens.WETH.address,
          tokens.WBTC.address,
          wei("250"),
          exchange,
          [],
          ExchangeType.TO_EXACT
        );

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("500"));
        assert.equal((await tokens.WBTC.balanceOf(traderPool.address)).toFixed(), wei("250", 8));
      });

      it("should not exchange blacklisted tokens", async () => {
        await coreProperties.addBlacklistTokens([tokens.WBTC.address]);

        const exchange1 = (
          await traderPool.getExchangeAmount(
            tokens.WETH.address,
            tokens.WBTC.address,
            wei("500"),
            [],
            ExchangeType.TO_EXACT
          )
        )[0];

        const exchange2 = (
          await traderPool.getExchangeAmount(
            tokens.WBTC.address,
            tokens.WETH.address,
            wei("500"),
            [],
            ExchangeType.FROM_EXACT
          )
        )[0];

        assert.equal(exchange1.toFixed(), "0");
        assert.equal(exchange2.toFixed(), "0");

        await truffleAssert.reverts(
          exchangeToExact(tokens.WETH.address, tokens.WBTC.address, wei("500")),
          "TP: blacklisted token"
        );
        await truffleAssert.reverts(
          exchangeFromExact(tokens.WBTC.address, tokens.WETH.address, wei("500")),
          "TP: blacklisted token"
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

      it("should open a position, then position gets blacklisted", async () => {
        await tokens.MANA.approve(uniswapV2Router.address, wei("1000000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("1000000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        let info = await traderPool.getPoolInfo();

        assert.deepEqual(info.openPositions, [tokens.MANA.address]);
        assert.equal(toBN(info.totalPoolBase).toFixed(), wei("1000"));
        assert.equal(toBN(info.totalPoolUSD).toFixed(), wei("1000"));

        await coreProperties.addBlacklistTokens([tokens.MANA.address]);

        info = await traderPool.getPoolInfo();

        assert.deepEqual(info.openPositions, []);
        assert.equal(toBN(info.totalPoolBase).toFixed(), wei("900"));
        assert.equal(toBN(info.totalPoolUSD).toFixed(), wei("900"));

        assert.equal((await tokens.WETH.balanceOf(traderPool.address)).toFixed(), wei("900"));
        assert.equal((await tokens.MANA.balanceOf(traderPool.address)).toFixed(), wei("100"));
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

      it("should calculate trader commission", async () => {
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

        await truffleAssert.reverts(reinvestCommission([0, 5]), "TP: no commission available");

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_MONTH);

        assert.equal((await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));

        const userCommission = await traderPool.getUsersInfo(NOTHING, 0, 1);
        const commission = await traderPool.getReinvestCommissions([0, 5]);

        await reinvestCommission([0, 5]);

        assert.deepEqual(userCommission[0], ["0", "0", "0", "0", "0", "0", "0"]);
        assert.equal(toBN(userCommission[1].owedBaseCommission).toFixed(), "0");
        assert.equal(toBN(userCommission[1].owedLPCommission).toFixed(), "0");
        assert.equal(toBN(userCommission[2].owedBaseCommission).toFixed(), wei("250"));
        assert.closeTo(
          toBN(userCommission[2].owedLPCommission).toNumber(),
          toBN(wei("166.6666666")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );

        assert.equal(toBN(commission.traderBaseCommission).toFixed(), wei("175"));
        assert.closeTo(
          toBN(commission.traderLPCommission).toNumber(),
          toBN(wei("116.6666666")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
        assert.closeTo(
          toBN(commission.traderUSDCommission).toNumber(),
          toBN(wei("175.35")).toNumber(),
          toBN(wei("0.001")).toNumber()
        );
        assert.equal(toBN(commission.dexeBaseCommission).toFixed(), wei("75"));
        assert.closeTo(
          toBN(commission.dexeLPCommission).toNumber(),
          toBN(wei("50")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
        assert.closeTo(
          toBN(commission.dexeUSDCommission).toNumber(),
          toBN(wei("75.15")).toNumber(),
          toBN(wei("0.001")).toNumber()
        );
        assert.closeTo(
          toBN(commission.dexeDexeCommission).toNumber(),
          toBN(wei("75.15")).toNumber(),
          toBN(wei("0.001")).toNumber()
        );

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          toBN(wei("1116.6666666")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );

        await truffleAssert.reverts(reinvestCommission([0, 5]), "TP: no commission available");
      });

      it("should calculate trader commission 2", async () => {
        await tokens.WETH.mint(THIRD, wei("1000"));

        await tokens.WETH.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.WETH.approve(traderPool.address, wei("1000"), { from: THIRD });
        await invest(wei("1000"), THIRD);

        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("2000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("2000"));

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_MONTH);

        const commission1 = await traderPool.getReinvestCommissions([0, 1, 1, 1]);
        const commission2 = await traderPool.getReinvestCommissions([0, 2]);

        assert.deepEqual(commission1, commission2);

        await reinvestCommission([0, 1, 1, 1]);

        assert.equal(toBN(commission1.traderBaseCommission).toFixed(), wei("350"));
        assert.closeTo(
          toBN(commission1.traderLPCommission).toNumber(),
          toBN(wei("233.33333333")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );

        assert.equal(toBN(commission1.dexeBaseCommission).toFixed(), wei("150"));
        assert.closeTo(
          toBN(commission1.dexeLPCommission).toNumber(),
          toBN(wei("100")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
      });

      it("should allow commission calculation if the positions are blacklisted", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await tokens.MANA.approve(uniswapV2Router.address, wei("2000000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("900"));

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_MONTH);

        await truffleAssert.reverts(reinvestCommission([0, 5]), "TP: positions are open");

        await coreProperties.addBlacklistTokens([tokens.MANA.address]);

        await truffleAssert.passes(reinvestCommission([0, 5]), "Calculates the commission");
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

        await truffleAssert.reverts(reinvestCommission([0, 5]), "TP: no commission available");
      });

      it("there shouldn't be any commission 2", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        await exchangeFromExact(tokens.MANA.address, tokens.WETH.address, wei("1000"));

        await setTime((await getCurrentBlockTime()) + SECONDS_IN_MONTH);

        await reinvestCommission([0, 5]);

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

        await truffleAssert.reverts(reinvestCommission([0, 5]), "TP: no commission available");
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

      it("trader should not divest if positions > 0", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await truffleAssert.reverts(divest(wei("500"), OWNER), "TP: can't divest");
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

      it("should not divest in the same block", async () => {
        const bundle = await BundleMock.new();

        await tokens.WETH.transfer(bundle.address, wei("100"));

        await truffleAssert.reverts(
          bundle.investDivest(traderPool.address, tokens.WETH.address, wei("10")),
          "TP: wrong amount"
        );
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

      it("should divest investor with blacklist commission", async () => {
        await exchangeFromExact(tokens.WETH.address, tokens.MANA.address, wei("1000"));

        await uniswapV2Router.setReserve(tokens.MANA.address, wei("500000"));
        await uniswapV2Router.setReserve(tokens.WETH.address, wei("1000000"));

        const balance = await traderPool.balanceOf(OWNER);

        await exchangeToExact(tokens.MANA.address, tokens.WETH.address, wei("1500"));

        await coreProperties.addBlacklistTokens([tokens.MANA.address]);

        await divest(wei("1000"), SECOND);

        assert.closeTo(
          (await traderPool.balanceOf(OWNER)).toNumber(),
          balance.plus(wei("70")).toNumber(),
          toBN(wei("0.000001")).toNumber()
        );
        assert.equal((await tokens.WETH.balanceOf(SECOND)).toFixed(), wei("1125"));
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

      it("should transfer all tokens and remove and add investor", async () => {
        assert.equal(await traderPool.totalInvestors(), "1");
        assert.isTrue(await traderPool.isInvestor(SECOND));
        assert.isFalse(await traderPool.isInvestor(THIRD));

        await traderPool.transfer(THIRD, wei("1000"), { from: SECOND });

        assert.equal(await traderPool.totalInvestors(), "1");
        assert.isTrue(await traderPool.isInvestor(THIRD));
        assert.isFalse(await traderPool.isInvestor(SECOND));
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
        minimalInvestment: wei("1", 8),
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

      it("should not invest", async () => {
        await truffleAssert.reverts(invest(0, OWNER), "TP: zero investment");
        await truffleAssert.reverts(invest(1, OWNER), "TP: underinvestment");
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
            .idiv(DEFAULT_CORE_PROPERTIES.traderParams.commissionDurations[POOL_PARAMETERS.commissionPeriod])
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

  describe("Private TraderPool", () => {
    let POOL_PARAMETERS;

    beforeEach("setup", async () => {
      POOL_PARAMETERS = {
        descriptionURL: "placeholder.com",
        trader: OWNER,
        privatePool: true,
        totalLPEmission: 0,
        baseToken: tokens.MANA.address,
        baseTokenDecimals: 18,
        minimalInvestment: 0,
        commissionPeriod: ComissionPeriods.PERIOD_1,
        commissionPercentage: toBN(50).times(PRECISION).toFixed(),
      };

      traderPool = await deployPool(POOL_PARAMETERS);
    });

    describe("token transfer", () => {
      beforeEach("setup", async () => {
        await traderPool.modifyPrivateInvestors([SECOND], true);

        await tokens.MANA.mint(SECOND, wei("1000"));

        await tokens.MANA.approve(traderPool.address, wei("1000"));
        await invest(wei("1000"), OWNER);

        await tokens.MANA.approve(traderPool.address, wei("1000"), { from: SECOND });
        await invest(wei("1000"), SECOND);
      });

      it("should transfer tokens from trader to investor", async () => {
        assert.equal(toBN(await traderPool.balanceOf(OWNER)).toFixed(), wei("1000"));
        assert.equal(toBN(await traderPool.balanceOf(SECOND)).toFixed(), wei("1000"));

        await traderPool.transfer(SECOND, wei("100"));

        assert.equal(toBN(await traderPool.balanceOf(OWNER)).toFixed(), wei("900"));
        assert.equal(toBN(await traderPool.balanceOf(SECOND)).toFixed(), wei("1100"));
      });

      it("should not transfer tokens to not private investor", async () => {
        await truffleAssert.reverts(traderPool.transfer(THIRD, wei("100"), { from: SECOND }), "TP: private pool");
      });

      it("should not transfer 0 tokens", async () => {
        await truffleAssert.reverts(traderPool.transfer(SECOND, 0), "TP: 0 transfer");
      });

      it("should not transfer tokens if total investors > max", async () => {
        await traderPool.modifyPrivateInvestors([THIRD], true);
        await coreProperties.setMaximumPoolInvestors(0);

        await truffleAssert.reverts(traderPool.transfer(THIRD, wei("1")), "TP: max investors");
      });
    });
  });
});
