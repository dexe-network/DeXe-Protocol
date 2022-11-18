const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/utils/utils");
const { setTime, getCurrentBlockTime } = require("./helpers/block-helper");
const { PRECISION } = require("../scripts/utils/constants");
const truffleAssert = require("truffle-assertions");

const ERC721Power = artifacts.require("ERC721Power");
const ERC20Mock = artifacts.require("ERC20Mock");

ERC721Power.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

describe.only("ERC721Power", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let token;
  let nft;

  let startTime;
  let DEFAULT_AMOUNT = wei("10000");

  const deployNft = async function (startTime, maxPower, reductionPercent, requiredCollateral) {
    token = await ERC20Mock.new("Mock", "Mock", 18);
    nft = await ERC721Power.new(
      "NFTMock",
      "NFTM",
      startTime,
      token.address,
      maxPower,
      reductionPercent,
      requiredCollateral
    );

    await token.mint(SECOND, DEFAULT_AMOUNT);
    await token.mint(THIRD, DEFAULT_AMOUNT);
    await token.approve(nft.address, DEFAULT_AMOUNT, { from: SECOND });
    await token.approve(nft.address, DEFAULT_AMOUNT, { from: THIRD });
  };

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
  });

  beforeEach("setup", async () => {
    startTime = await getCurrentBlockTime();
  });

  function toPercent(num) {
    return PRECISION.times(num);
  }

  describe("access", () => {
    beforeEach("setup", async () => {
      await deployNft(startTime + 1000, "1", "1", "1");
    });

    it("only owner should call these functions", async () => {
      await truffleAssert.reverts(nft.setNftMaxPower(1, 1, { from: SECOND }), "Ownable: caller is not the owner");

      await truffleAssert.reverts(
        nft.setNftRequiredCollateral(1, 1, { from: SECOND }),
        "Ownable: caller is not the owner"
      );

      await truffleAssert.reverts(nft.safeMint(OWNER, 1, { from: SECOND }), "Ownable: caller is not the owner");

      await truffleAssert.reverts(nft.setBaseUri("", { from: SECOND }), "Ownable: caller is not the owner");
    });
  });

  describe("ERC165", () => {
    beforeEach("setup", async () => {
      await deployNft(startTime + 1000, "1", "1", "1");
    });

    it("should support these interfaces", async () => {
      assert.isTrue(await nft.supportsInterface("0xcf72ef58"));
      assert.isTrue(await nft.supportsInterface("0x780e9d63"));
    });
  });

  describe("setNftMaxPower()", () => {
    beforeEach("setup", async () => {
      await deployNft(startTime + 1000, "1", "1", "1");
    });

    it("should correctly set max power", async () => {
      await setTime(startTime + 100);

      await nft.setNftMaxPower("10", "1");

      assert.equal((await nft.nftInfos("1")).maxPower, "10");
      assert.equal(await nft.getMaxPowerForNft(1), "10");
    });

    it("should revert if try to set max power to zero", async () => {
      await setTime(startTime + 200);
      await truffleAssert.reverts(nft.setNftMaxPower("0", "1"), "ERC721Power: max power can't be zero");
    });

    it("should revert if try to set max power for nft after calculation start", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(nft.setNftMaxPower("10", "1"), "ERC721Power: power calculation already begun");
    });
  });

  describe("setNftRequiredCollateral()", () => {
    beforeEach("setup", async () => {
      await deployNft(startTime + 1000, "1", "1", "1");
    });

    it("should correctly set required collateral amount for nft", async () => {
      await setTime(startTime + 100);

      await nft.setNftRequiredCollateral("100", "1");

      assert.equal((await nft.nftInfos("1")).requiredCollateral, "100");
      assert.equal(await nft.getRequiredCollateralForNft(1), "100");
    });

    it("should revert if try to set required collateral amount for nft to zero", async () => {
      await setTime(startTime + 998);

      await truffleAssert.reverts(
        nft.setNftRequiredCollateral("0", "1"),
        "ERC721Power: required collateral amount can't be zero"
      );
    });

    it("should revert if try to set required collateral amount after calculation start", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(
        nft.setNftRequiredCollateral("10", "1"),
        "ERC721Power: power calculation already begun"
      );
    });
  });

  describe("safeMint()", () => {
    beforeEach("setup", async () => {
      await deployNft(startTime + 1000, "1", "1", "1");
    });

    it("should correctly mint mock20s and increase total power", async () => {
      await setTime(startTime + 100);

      assert.equal(await nft.totalSupply(), "0");

      assert.equal(await nft.totalPower(), "0");

      await nft.safeMint(SECOND, 1);

      assert.equal(await nft.totalSupply(), "1");
      assert.equal(await nft.ownerOf("1"), SECOND);
      assert.equal(await nft.totalPower(), "1");
    });

    it("should revert when calculation already begun", async () => {
      await setTime(startTime + 999);
      await truffleAssert.reverts(nft.safeMint(SECOND, 1), "ERC721Power: power calculation already begun");
    });
  });

  describe("setBaseUri()", () => {
    beforeEach("setup", async () => {
      await deployNft(startTime + 1000, "1", "1", "1");
      await nft.safeMint(SECOND, 1);
    });

    it("should correctly set base uri", async () => {
      await nft.setBaseUri("placeholder");

      assert.equal(await nft.tokenURI(1), "placeholder1");
      assert.equal(await nft.baseURI(), "placeholder");
    });
  });

  describe("recalculateNftPower()", () => {
    beforeEach(async () => {
      await deployNft(startTime + 1000, toPercent("90"), toPercent("0.01"), "540");

      await nft.safeMint(SECOND, 1);
      await nft.safeMint(SECOND, 2);
      await nft.safeMint(THIRD, 3);
    });

    it("should correctly recalculate nft power", async () => {
      await setTime(startTime + 900);

      await nft.recalculateNftPower("1");

      let infos = await nft.nftInfos("1");
      assert.equal(infos.lastUpdate, "0");
      assert.equal(infos.currentPower, "0");
      assert.equal(infos.currentCollateral, "0");

      await setTime(startTime + 1000);
      await nft.recalculateNftPower("1");

      infos = await nft.nftInfos("1");
      assert.equal(infos.lastUpdate.toFixed(), startTime + 1001);
      assert.equal(toBN(infos.currentPower).toFixed(), toPercent("89.991").toFixed());
      assert.equal(infos.currentCollateral.toFixed(), "0");
    });
  });

  describe("addCollateral()", () => {
    beforeEach(async () => {
      await deployNft(startTime + 1000, toPercent("110"), toPercent("0.01"), wei("500"));
      await nft.safeMint(SECOND, "1");
    });

    it("should add collateral", async () => {
      await setTime(startTime + 900);
      await nft.addCollateral(wei("200"), "1", { from: SECOND });
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      assert.equal(await token.balanceOf(nft.address), wei("400"));
      assert.equal((await nft.nftInfos("1")).currentCollateral.toFixed(), wei("400"));
    });

    it("should recalculate nft power", async () => {
      await setTime(startTime + 1000);
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      const infos = await nft.nftInfos("1");

      assert.equal(infos.lastUpdate.toFixed(), startTime + 1001);
      assert.equal(infos.currentCollateral.toFixed(), wei("200"));
    });

    it("nft power should not decrease", async () => {
      await setTime(startTime + 1000);
      await nft.addCollateral(wei("500"), "1", { from: SECOND });

      let power = (await nft.nftInfos("1")).currentPower.toFixed();

      await setTime(startTime + 2000);

      assert.equal((await nft.nftInfos("1")).currentPower.toFixed(), power);
    });

    it("should revert if try to add collateral from not a nft owner", async () => {
      await truffleAssert.reverts(
        nft.addCollateral("1", "1", { from: THIRD }),
        "ERC721Power: sender isn't an nft owner"
      );
    });
  });

  describe("removeCollateral()", () => {
    beforeEach("setup", async () => {
      await deployNft(startTime + 1000, toPercent("110"), toPercent("0.01"), wei("500"));

      await nft.safeMint(SECOND, 1);
    });

    it("should remove collateral", async () => {
      await setTime(startTime + 900);
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      await nft.removeCollateral(wei("150"), "1", { from: SECOND });

      assert.equal((await token.balanceOf(nft.address)).toFixed(), wei("50"));
      assert.equal(toBN(await token.balanceOf(SECOND)).toFixed(), toBN(DEFAULT_AMOUNT).minus(wei("50")).toFixed());

      await nft.removeCollateral(wei("50"), "1", { from: SECOND });
      await truffleAssert.reverts(
        nft.removeCollateral(wei("1"), "1", { from: SECOND }),
        "ERC721Power: wrong collateral amount"
      );
    });

    it("should recalculate nft power", async () => {
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      await setTime(startTime + 1000);
      await nft.removeCollateral(wei("100"), "1", { from: SECOND });

      const infos = await nft.nftInfos("1");

      assert.equal(infos.lastUpdate.toFixed(), startTime + 1001);
      assert.equal(infos.currentPower.toFixed(), toPercent("109.989").toFixed());
      assert.equal(infos.currentCollateral.toFixed(), wei("100"));
    });

    it("should decrease power slightly", async () => {
      await nft.addCollateral(wei("500"), "1", { from: SECOND });
      await setTime(startTime + 1000000);

      await nft.removeCollateral(wei("1"), "1", { from: SECOND });

      assert.equal((await nft.nftInfos("1")).currentPower.toFixed(), toPercent("110").toFixed());

      await nft.recalculateNftPower("1");

      assert.equal((await nft.nftInfos("1")).currentPower.toFixed(), toPercent("109.989").toFixed());
    });

    it("should not increase power", async () => {
      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      await setTime(startTime + 3000);

      await nft.addCollateral(wei("200"), "1", { from: SECOND });

      assert.equal((await nft.nftInfos("1")).currentPower.toFixed(), toPercent("87.989").toFixed());

      await nft.recalculateNftPower("1");

      assert.equal((await nft.nftInfos("1")).currentPower.toFixed(), toPercent("87.989").toFixed());
    });

    it("should revert if try to remove collateral from not a nft owner", async () => {
      await truffleAssert.reverts(nft.removeCollateral("1", "1"), "ERC721Power: sender isn't an nft owner");
    });
  });
});
