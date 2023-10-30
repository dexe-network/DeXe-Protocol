const { assert } = require("chai");
const { toBN, accounts, wei } = require("../../../scripts/utils/utils");
const toPercent = require("../../utils/utils").toBNPercent;

const { setTime, getCurrentBlockTime } = require("../../helpers/block-helper");
const { ZERO_ADDR } = require("../../../scripts/utils/constants");
const Reverter = require("../../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ERC721EquivalentPower = artifacts.require("ERC721EquivalentPower");
const ERC20Mock = artifacts.require("ERC20Mock");

ERC721EquivalentPower.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

describe("ERC721EquivalentPower", () => {
  let OWNER;

  let token;
  let nft;

  let startTime;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);

    startTime = (await getCurrentBlockTime()) + 1000;

    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721EquivalentPower.new();

    await nft.__ERC721EquivalentPower_init(
      "NFTMock",
      "NFTM",
      startTime,
      token.address,
      toPercent("0.001"),
      wei("1"),
      wei("1"),
      wei("100")
    );

    await token.mint(OWNER, wei("100"));
    await token.approve(nft.address, wei("100"));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("initialize", () => {
    it("should not initialize twice", async () => {
      await truffleAssert.reverts(
        nft.__ERC721EquivalentPower_init("", "", startTime, ZERO_ADDR, "1", "2", "3", "4"),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("functionanality", () => {
    it("it should add and remove collateral", async () => {
      await nft.mint(OWNER, 1, "URI");

      await setTime(startTime + 10000);

      assert.equal(toBN(await nft.getNftRequiredCollateral(1)).toFixed(), wei("1"));

      await nft.addCollateral(wei("100"), "1");
      await nft.removeCollateral(wei("100"), "1");
    });

    it("should work with power", async () => {
      await nft.mint(OWNER, 1, "URI");

      await setTime(startTime + 10000);

      await nft.addCollateral(wei("100"), "1");
      await nft.recalculateNftPowers([1]);

      assert.equal(toBN(await nft.totalPower()).toFixed(), wei("100"));
      assert.equal(toBN(await nft.getNftMaxPower(1)).toFixed(), wei("100"));
      assert.equal(toBN(await nft.getNftPower(1)).toFixed(), wei("100"));

      await nft.removeCollateral(wei("100"), "1");

      await setTime(startTime + 1000000);

      await nft.recalculateNftPowers([1]);

      assert.equal(toBN(await nft.totalPower()).toFixed(), wei("100"));
      assert.equal(toBN(await nft.getNftMaxPower(1)).toFixed(), "0");
      assert.equal(toBN(await nft.getNftPower(1)).toFixed(), "0");
    });
  });
});
