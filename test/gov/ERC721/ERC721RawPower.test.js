const { assert } = require("chai");
const { toBN, accounts, wei } = require("../../../scripts/utils/utils");
const toPercent = require("../../utils/utils").toBNPercent;

const { setTime, getCurrentBlockTime } = require("../../helpers/block-helper");
const { ZERO_ADDR, PERCENTAGE_100 } = require("../../../scripts/utils/constants");
const Reverter = require("../../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ERC721RawPower = artifacts.require("ERC721RawPowerMock");
const ERC20Mock = artifacts.require("ERC20Mock");

ERC721RawPower.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";

describe("ERC721RawPower", () => {
  let OWNER;
  let SECOND;
  let THIRD;
  let NOTHING;

  let token;
  let nft;

  let startTime;
  let DEFAULT_AMOUNT = wei("10000");

  const reverter = new Reverter();

  const deployNft = async function (startTime, reductionPercent, nftMaxRawPower, nftRequiredCollateral) {
    token = await ERC20Mock.new("Mock", "Mock", 18);

    await nft.__ERC721RawPower_init(
      "NFTMock",
      "NFTM",
      startTime,
      token.address,
      reductionPercent,
      nftMaxRawPower,
      nftRequiredCollateral,
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

    NOTHING = await accounts(9);

    startTime = await getCurrentBlockTime();

    nft = await ERC721RawPower.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("coverage", () => {
    it("should not burn random token", async () => {
      await truffleAssert.reverts(nft.burn(1337));
    });
  });

  describe("initialize", () => {
    it("should revert if the token address is zero", async () => {
      await truffleAssert.reverts(
        nft.__ERC721RawPower_init("", "", startTime, ZERO_ADDR, "1", "2", "3"),
        "ERC721Power: zero address",
      );
    });

    it("should revert if the max power is zero", async () => {
      await truffleAssert.reverts(
        nft.__ERC721RawPower_init("", "", startTime, NOTHING, "2", "0", "3"),
        "ERC721Power: max power can't be zero",
      );
    });

    it("should revert if the reduction percent is zero", async () => {
      await truffleAssert.reverts(
        nft.__ERC721RawPower_init("", "", startTime, NOTHING, "0", "1", "3"),
        "ERC721Power: reduction percent can't be zero",
      );
    });

    it("should revert if the reduction percent >= 100%", async () => {
      await truffleAssert.reverts(
        nft.__ERC721RawPower_init("", "", startTime, NOTHING, PERCENTAGE_100, "1", "3"),
        "ERC721Power: reduction can't be 100%",
      );
    });

    it("should revert if the required collateral is zero", async () => {
      await truffleAssert.reverts(
        nft.__ERC721RawPower_init("", "", startTime, NOTHING, "1", "2", "0"),
        "ERC721Power: required collateral amount can't be zero",
      );
    });

    it("should initialize properly if all conditions are met", async () => {
      await nft.__ERC721RawPower_init("", "", startTime, NOTHING, "1", "2", "3");

      assert.equal(toBN(await nft.powerCalcStartTimestamp()).toFixed(), startTime);
      assert.equal(await nft.collateralToken(), NOTHING);
      assert.equal(toBN(await nft.reductionPercent()).toFixed(), "1");
      assert.equal(toBN(await nft.nftMaxRawPower()).toFixed(), "2");
      assert.equal(toBN(await nft.nftRequiredCollateral()).toFixed(), "3");
    });

    it("should not initialize twice", async () => {
      await nft.__ERC721RawPower_init("", "", startTime, NOTHING, "1", "2", "3");

      await truffleAssert.reverts(
        nft.__ERC721RawPower_init("", "", startTime, NOTHING, "1", "2", "3"),
        "Initializable: contract is already initialized",
      );
    });

    it("should not initialize if non-initializing", async () => {
      await truffleAssert.reverts(nft.mockInit(), "Initializable: contract is not initializing");
    });
  });

  describe("functionality", async () => {
    describe("access", () => {
      beforeEach(async () => {
        await deployNft(startTime + 1000, "1", "1", "1");
      });

      it("only owner should call these functions", async () => {
        await truffleAssert.reverts(nft.setNftMaxRawPower(1, 1, { from: SECOND }), "Ownable: caller is not the owner");
        await truffleAssert.reverts(
          nft.setNftRequiredCollateral(1, 1, { from: SECOND }),
          "Ownable: caller is not the owner",
        );
        await truffleAssert.reverts(nft.mint(OWNER, 1, "URI", { from: SECOND }), "Ownable: caller is not the owner");
        await truffleAssert.reverts(nft.setTokenURI(1, "", { from: SECOND }), "Ownable: caller is not the owner");
      });
    });

    describe("ERC165", () => {
      beforeEach("setup", async () => {
        await deployNft(startTime + 1000, "1", "1", "1");
      });

      it("should support these interfaces", async () => {
        assert.isTrue(await nft.supportsInterface("0x24b96d42"));
        assert.isTrue(await nft.supportsInterface("0x780e9d63"));
      });
    });

    describe("totalPower()", () => {
      beforeEach(async () => {
        await deployNft(startTime + 1000, toPercent("0.01"), toPercent("90"), "540");
      });

      it("should be zero if no minted nfts", async () => {
        await nft.setNftMaxRawPower("1337", "1");
        await nft.setNftMaxRawPower("1337000", "2");

        assert.equal(toBN(await nft.totalPower()).toFixed(), "0");
      });

      describe("after nfts minting", () => {
        beforeEach(async () => {
          await nft.mint(SECOND, 1, "URI1");
          await nft.mint(SECOND, 2, "URI2");
          await nft.mint(THIRD, 3, "URI3");
        });

        it("should return proper total power", async () => {
          assert.equal(toBN(await nft.totalPower()).toFixed(), toPercent("90").times(3).toFixed());
        });

        it("should not change totalPower if power was set to an nft which does not exist", async () => {
          await nft.setNftMaxRawPower(toPercent("100"), 4);

          assert.equal(toBN(await nft.totalPower()).toFixed(), toPercent("90").times(3).toFixed());
        });

        it("should change total power if setNftMaxRawPower was called", async () => {
          await nft.setNftMaxRawPower(toPercent("100"), 1);
          await nft.setNftMaxRawPower("1337", 2);

          assert.equal(
            toBN(await nft.totalPower()).toFixed(),
            toPercent("90").plus(toPercent("100")).plus("1337").toFixed(),
          );
        });

        it("should recalculate total power when nft is being transferred and startTimestamp is reached", async () => {
          await setTime(startTime + 1000);

          await nft.transferFrom(SECOND, THIRD, 1, { from: SECOND });

          assert.equal(toBN(await nft.getNftPower(1)).toFixed(), toPercent("89.991").toFixed());
          assert.equal(
            toBN(await nft.totalPower()).toFixed(),
            toPercent("90").times(2).plus(toPercent("89.991")).toFixed(),
          );
        });

        it("should not recalculate total power when nft is being transferred and startTimestamp is not reached", async () => {
          await nft.transferFrom(SECOND, THIRD, 1, { from: SECOND });

          assert.equal(toBN(await nft.getNftPower(1)).toFixed(), toPercent("0").toFixed());
          assert.equal(toBN(await nft.totalPower()).toFixed(), toPercent("90").times(3).toFixed());
        });
      });
    });

    describe("setNftMaxRawPower()", () => {
      beforeEach(async () => {
        await deployNft(startTime + 1000, "1", "1", "1");
      });

      it("should correctly set max power", async () => {
        await setTime(startTime + 100);

        await nft.setNftMaxRawPower("10", "1");

        assert.equal(toBN((await nft.getNftInfo("1")).maxPower).toFixed(), "0");
        assert.equal(toBN((await nft.getNftInfo("1")).rawInfo.maxRawPower).toFixed(), "10");
        assert.equal(toBN(await nft.getNftMaxPower(1)).toFixed(), "0");
      });

      it("should revert if try to set max power to zero", async () => {
        await setTime(startTime + 200);

        await truffleAssert.reverts(nft.setNftMaxRawPower("0", "1"), "ERC721Power: max power can't be zero");
      });

      it("should revert if try to set max power for nft after calculation start", async () => {
        await setTime(startTime + 999);

        await truffleAssert.reverts(nft.setNftMaxRawPower("10", "1"), "ERC721Power: power calculation already begun");
      });
    });

    describe("getNftMinPower()", () => {
      beforeEach(async () => {
        await deployNft(startTime + 1000, "1", wei("100"), wei("500"));
        await nft.mint(SECOND, 1, "URI");
      });

      it("should return correct min power", async () => {
        assert.equal((await nft.getNftMinPower(1)).toFixed(), "0");

        await nft.addCollateral(wei("250"), "1", { from: SECOND });

        await setTime((await getCurrentBlockTime()) + 1000);

        assert.equal((await nft.getNftMinPower(1)).toFixed(), wei("50"));
      });
    });

    describe("setNftRequiredCollateral()", () => {
      beforeEach(async () => {
        await deployNft(startTime + 1000, "1", "1", "1");
      });

      it("should correctly set required collateral amount for nft", async () => {
        await setTime(startTime + 100);

        await nft.setNftRequiredCollateral("100", "1");

        assert.equal(toBN((await nft.getNftInfo("1")).rawInfo.requiredCollateral).toFixed(), "100");
        assert.equal(toBN(await nft.getNftRequiredCollateral(1)).toFixed(), "100");
      });

      it("should revert if try to set required collateral amount for nft to zero", async () => {
        await setTime(startTime + 998);

        await truffleAssert.reverts(
          nft.setNftRequiredCollateral("0", "1"),
          "ERC721Power: required collateral amount can't be zero",
        );
      });

      it("should revert if try to set required collateral amount after calculation start", async () => {
        await setTime(startTime + 999);

        await truffleAssert.reverts(
          nft.setNftRequiredCollateral("10", "1"),
          "ERC721Power: power calculation already begun",
        );
      });
    });

    describe("mint()", () => {
      beforeEach(async () => {
        await deployNft(startTime + 1000, "1", "1", "1");
      });

      it("should correctly mint mock20s and increase total power", async () => {
        await setTime(startTime + 100);

        assert.equal(await nft.totalSupply(), "0");
        assert.equal(await nft.totalPower(), "0");

        await nft.mint(SECOND, 1, "URI1");

        assert.equal(toBN(await nft.totalSupply()).toFixed(), "1");
        assert.equal(await nft.ownerOf("1"), SECOND);
        assert.equal(toBN(await nft.totalPower()).toFixed(), "1");
        assert.equal(await nft.tokenURI(1), "URI1");
      });

      it("should revert when calculation already begun", async () => {
        await setTime(startTime + 999);

        await truffleAssert.reverts(nft.mint(SECOND, 1, "URI"), "ERC721Power: power calculation already begun");
      });
    });

    describe("setTokenURI()", () => {
      beforeEach(async () => {
        await deployNft(startTime + 1000, "1", "1", "1");
        await nft.mint(SECOND, 1, "URI1");
      });

      it("should correctly set base uri", async () => {
        assert.equal(await nft.tokenURI(1), "URI1");

        await nft.setTokenURI(1, "placeholder");

        assert.equal(await nft.tokenURI(1), "placeholder");
      });
    });

    describe("recalculateNftPowers()", () => {
      beforeEach(async () => {
        await deployNft(startTime + 1000, toPercent("0.01"), toPercent("90"), "540");

        await nft.mint(SECOND, 1, "URI1");
        await nft.mint(SECOND, 2, "URI2");
        await nft.mint(THIRD, 3, "URI3");
      });

      it("should correctly recalculate nft power", async () => {
        await setTime(startTime + 900);

        await nft.recalculateNftPowers(["1"]);

        let infos = await nft.getNftInfo("1");
        assert.equal(toBN(infos.rawInfo.lastUpdate).toFixed(), "0");
        assert.equal(toBN(infos.rawInfo.currentRawPower).toFixed(), "0");
        assert.equal(toBN(infos.currentPower).toFixed(), "0");
        assert.equal(toBN(infos.rawInfo.currentCollateral).toFixed(), "0");
        assert.equal(toBN(await nft.totalPower()).toFixed(), toPercent("90").times(3).toFixed());

        await setTime(startTime + 1000);
        await nft.recalculateNftPowers(["1"]);

        infos = await nft.getNftInfo("1");
        assert.equal(toBN(infos.rawInfo.lastUpdate).toFixed(), startTime + 1001);
        assert.equal(toBN(infos.rawInfo.currentRawPower).toFixed(), toPercent("89.991").toFixed());
        assert.equal(toBN(infos.currentPower).toFixed(), toPercent("89.991").toFixed());
        assert.equal(toBN(infos.rawInfo.currentCollateral).toFixed(), "0");
        assert.equal(
          toBN(await nft.totalPower()).toFixed(),
          toPercent("90").times(2).plus(toPercent("89.991")).toFixed(),
        );

        await setTime(startTime + 2000);
        await nft.recalculateNftPowers(["1"]);

        infos = await nft.getNftInfo("1");
        assert.equal(toBN(infos.rawInfo.lastUpdate).toFixed(), startTime + 2001);
        assert.equal(toBN(infos.currentPower).toFixed(), toPercent("80.991").toFixed());
        assert.equal(toBN(infos.rawInfo.currentCollateral).toFixed(), "0");
        assert.equal(
          toBN(await nft.totalPower()).toFixed(),
          toPercent("90").times(2).plus(toPercent("80.991")).toFixed(),
        );
      });

      it("should not recalculate non-existing NFT power", async () => {
        let power = await nft.getNftPower(1337);

        await setTime(startTime + 900);
        await nft.recalculateNftPowers([1337]);

        assert.equal(toBN(power).toFixed(), "0");
        assert.equal(toBN(power).toFixed(), toBN(await nft.getNftPower(1337)).toFixed());
      });
    });

    describe("addCollateral()", () => {
      beforeEach(async () => {
        await deployNft(startTime + 1000, toPercent("0.01"), toPercent("110"), wei("500"));
        await nft.mint(SECOND, 1, "URI");
      });

      it("should add collateral", async () => {
        await setTime(startTime + 900);

        await nft.addCollateral(wei("200"), "1", { from: SECOND });
        await nft.addCollateral(wei("200"), "1", { from: SECOND });

        assert.equal(toBN(await token.balanceOf(nft.address)).toFixed(), wei("400"));
        assert.equal(toBN((await nft.getNftInfo("1")).rawInfo.currentCollateral).toFixed(), wei("400"));
      });

      it("should recalculate nft power", async () => {
        await setTime(startTime + 1000);
        await nft.addCollateral(wei("200"), "1", { from: SECOND });

        const infos = await nft.getNftInfo("1");

        assert.equal(toBN(infos.rawInfo.lastUpdate).toFixed(), startTime + 1001);
        assert.equal(toBN(infos.rawInfo.currentCollateral).toFixed(), wei("200"));
      });

      it("nft power should not decrease", async () => {
        await setTime(startTime + 1000);
        await nft.addCollateral(wei("500"), "1", { from: SECOND });

        let power = toBN((await nft.getNftInfo("1")).currentPower).toFixed();

        await setTime(startTime + 2000);

        assert.equal(toBN((await nft.getNftInfo("1")).currentPower).toFixed(), power);
      });

      it("should revert if try to add collateral from not a nft owner", async () => {
        await truffleAssert.reverts(
          nft.addCollateral("1", "1", { from: THIRD }),
          "ERC721Power: sender isn't an nft owner",
        );
      });

      it("should revert if try to add zero collateral", async () => {
        await truffleAssert.reverts(
          nft.addCollateral("0", "1", { from: SECOND }),
          "ERC721Power: wrong collateral amount",
        );
      });
    });

    describe("removeCollateral()", () => {
      beforeEach(async () => {
        await deployNft(startTime + 1000, toPercent("0.01"), toPercent("110"), wei("500"));

        await nft.mint(SECOND, 1, "URI");
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
          "ERC721Power: wrong collateral amount",
        );
      });

      it("should recalculate nft power", async () => {
        await nft.addCollateral(wei("200"), "1", { from: SECOND });

        await setTime(startTime + 1000);
        await nft.removeCollateral(wei("100"), "1", { from: SECOND });

        const infos = await nft.getNftInfo("1");

        assert.equal(toBN(infos.rawInfo.lastUpdate).toFixed(), startTime + 1001);
        assert.equal(toBN(infos.currentPower).toFixed(), toPercent("109.989").toFixed());
        assert.equal(toBN(infos.rawInfo.currentCollateral).toFixed(), wei("100"));
      });

      it("should decrease power slightly", async () => {
        await nft.addCollateral(wei("500"), "1", { from: SECOND });
        await setTime(startTime + 1000000);

        await nft.removeCollateral(wei("1"), "1", { from: SECOND });

        assert.equal(toBN((await nft.getNftInfo("1")).currentPower).toFixed(), toPercent("110").toFixed());

        await nft.recalculateNftPowers(["1"]);

        assert.equal(toBN((await nft.getNftInfo("1")).currentPower).toFixed(), toPercent("109.989").toFixed());
      });

      it("should not increase power", async () => {
        await nft.addCollateral(wei("200"), "1", { from: SECOND });

        await setTime(startTime + 3000);

        await nft.addCollateral(wei("200"), "1", { from: SECOND });

        assert.equal(toBN((await nft.getNftInfo("1")).currentPower).toFixed(), toPercent("87.989").toFixed());

        await nft.recalculateNftPowers(["1"]);

        assert.equal(toBN((await nft.getNftInfo("1")).currentPower).toFixed(), toPercent("87.989").toFixed());
      });

      it("should revert if try to remove collateral from not a nft owner", async () => {
        await truffleAssert.reverts(nft.removeCollateral("1", "1"), "ERC721Power: sender isn't an nft owner");
      });
    });
  });
});
