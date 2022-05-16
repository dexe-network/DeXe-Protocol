const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const { setTime } = require("./helpers/hardhatTimeTraveller");
const truffleAssert = require("truffle-assertions");

const ERC721Power = artifacts.require("ERC721Power");
const ERC20Mock = artifacts.require("ERC20Mock");

const PRECISION = toBN(10).pow(25);

describe("ERC721Power", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let token;
  let nft;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
  });

  beforeEach("setup", async () => {
    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721Power.new("NFTMock", "NFTM", 1000);
  });

  function toPercent(num) {
    return PRECISION.times(num);
  }

  describe("setReductionPercent()", () => {
    it("should correctly set reduction percent", async () => {
      await setTime(100);

      await nft.setReductionPercent(toPercent("1").toFixed());
      assert.equal(await nft.reductionPercent(), toPercent("1").toFixed());
    });
  });
});
