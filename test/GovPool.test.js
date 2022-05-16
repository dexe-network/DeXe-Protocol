const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const GovPool = artifacts.require("GovPool");
const GovValidators = artifacts.require("GovValidators");
const GovSettings = artifacts.require("GovSettings");
const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC721EnumMock = artifacts.require("ERC721EnumerableMock");
const ERC20Mock = artifacts.require("ERC20Mock");

GovPool.numberFormat = "BigNumber";
GovValidators.numberFormat = "BigNumber";
GovSettings.numberFormat = "BigNumber";
GovUserKeeper.numberFormat = "BigNumber";
ERC721EnumMock.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

const PRECISION = toBN(10).pow(25);

const INTERNAL_SETTINGS = {
  earlyCompletion: true,
  duration: 500,
  durationValidators: 600,
  quorum: PRECISION.times("51").toFixed(),
  quorumValidators: PRECISION.times("61").toFixed(),
  minTokenBalance: wei("10"),
  minNftBalance: 2,
};

const DEFAULT_SETTINGS = {
  earlyCompletion: false,
  duration: 700,
  durationValidators: 800,
  quorum: PRECISION.times("71").toFixed(),
  quorumValidators: PRECISION.times("100").toFixed(),
  minTokenBalance: wei("20"),
  minNftBalance: 3,
};

describe("GovPool", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let settings;
  let validators;
  let userKeeper;
  let govPool;
  let token;
  let nft;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
  });

  beforeEach("setup", async () => {
    token = await ERC20Mock.new("Mock", "Mock", 18);
    settings = await GovSettings.new();
    validators = await GovValidators.new();
    userKeeper = await GovUserKeeper.new();
    govPool = await GovPool.new();
  });

  describe("Fullfat GovPool", () => {
    beforeEach("setup", async () => {
      nft = await ERC721EnumMock.new("Mock", "Mock");

      await settings.__GovSettings_init(INTERNAL_SETTINGS, DEFAULT_SETTINGS);
      await validators.__GovValidators_init(
        "Validator Token",
        "VT",
        600,
        PRECISION.times("51").toFixed(),
        [OWNER],
        [wei("100")]
      );
      await userKeeper.__GovUserKeeper_init(token.address, nft.address, wei("33000"), 33);
      await govPool.__GovPool_init(settings.address, userKeeper.address, validators.address, 100, PRECISION.times(10));

      await settings.transferOwnership(govPool.address);
      await validators.transferOwnership(govPool.address);
      await userKeeper.transferOwnership(govPool.address);

      await token.mint(OWNER, wei("1000000"));

      for (let i = 1; i < 10; i++) {
        await nft.safeMint(OWNER, i);
        await nft.approve(userKeeper.address, i);
      }
    });

    describe("GovCreator", () => {
      describe("init", () => {
        it("should correctly set all parameters", async () => {
          assert.equal(await govPool.govSetting(), settings.address);
          assert.equal(await govPool.govUserKeeper(), userKeeper.address);
        });
      });
    });
  });
});
