const { assert } = require("chai");
const { accounts, toBN } = require("../../../scripts/utils/utils");
const { setTime, getCurrentBlockTime } = require("../../helpers/block-helper");
const { PRECISION } = require("../../../scripts/utils/constants");
const Reverter = require("../../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const DexeERC721Multiplier = artifacts.require("DexeERC721Multiplier");
const GovPoolMock = artifacts.require("GovPoolMock");

DexeERC721Multiplier.numberFormat = "BigNumber";
GovPoolMock.numberFormat = "BigNumber";

describe("DexeERC721Multiplier", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let nft;

  let govPool;

  const toMultiplier = (value) => PRECISION.times(value);

  const NFT_NAME = "NFTMultiplierMock";
  const NFT_SYMBOL = "NFTMM";

  const reverter = new Reverter();

  before(async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);

    nft = await DexeERC721Multiplier.new();

    govPool = await GovPoolMock.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  beforeEach("setup", async () => {
    await nft.__ERC721Multiplier_init(NFT_NAME, NFT_SYMBOL);
  });

  describe("initializer", async () => {
    it("should initialize properly if all conditions are met", async () => {
      assert.equal(await nft.name(), NFT_NAME);
      assert.equal(await nft.symbol(), NFT_SYMBOL);
    });

    it("should not initialize twice", async () => {
      await truffleAssert.reverts(
        nft.__ERC721Multiplier_init(NFT_NAME, NFT_SYMBOL),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("upgradeability", () => {
    beforeEach(async () => {
      const Proxy = artifacts.require("ERC1967Proxy");
      const proxy = await Proxy.new(nft.address, "0x");
      dexeNft = await DexeERC721Multiplier.at(proxy.address);
      dexeNft.__ERC721Multiplier_init(NFT_NAME, NFT_SYMBOL);
    });

    it("correct implementation", async () => {
      assert.equal(await dexeNft.getImplementation(), nft.address);
    });

    it("not owner cant upgrade", async () => {
      await truffleAssert.reverts(dexeNft.upgradeTo(nft.address, { from: SECOND }), "Ownable: caller is not the owner");
    });

    it("could upgrade", async () => {
      const nft1 = await DexeERC721Multiplier.new();
      await dexeNft.upgradeTo(nft1.address);
      assert.equal(await dexeNft.getImplementation(), nft1.address);
    });
  });

  describe("functionality", async () => {
    beforeEach(async () => {
      TOKENS = [
        {
          id: "1",
          multiplier: toMultiplier("1337").toFixed(),
          duration: "1000",
          averageBalance: "1000",
          uri: "URI1",
          owner: SECOND,
        },
        {
          id: "2",
          multiplier: toMultiplier("20").toFixed(),
          duration: "500",
          averageBalance: "2000",
          uri: "URI2",
          owner: THIRD,
        },
        {
          id: "3",
          multiplier: toMultiplier("1.5").toFixed(),
          duration: "200",
          averageBalance: "3000",
          uri: "URI3",
          owner: SECOND,
        },
        {
          id: "4",
          multiplier: toMultiplier("5.125").toFixed(),
          duration: "7050",
          averageBalance: "4000",
          uri: "URI4",
          owner: THIRD,
        },
      ];
    });

    describe("interfaceId()", () => {
      it("should support ERC721Enumerable and AbstractERC721Multiplier interfaces", async () => {
        assert.isTrue(await nft.supportsInterface("0x780e9d63"));
        assert.isTrue(await nft.supportsInterface("0x9958235b"));
      });
    });

    describe("mint()", () => {
      it("should mint properly", async () => {
        for (const token of TOKENS) {
          const tx = await nft.mint(token.owner, token.multiplier, token.duration, token.averageBalance, token.uri);

          truffleAssert.eventEmitted(tx, "Minted", (e) => {
            return (
              e.to === token.owner &&
              e.tokenId.toFixed() === token.id &&
              e.multiplier.toFixed() === token.multiplier &&
              e.duration.toFixed() === token.duration
            );
          });

          truffleAssert.eventEmitted(tx, "AverageBalanceChanged", (e) => {
            return e.user === token.owner && e.averageBalance.toFixed() === token.averageBalance;
          });
        }

        assert.equal(await nft.totalSupply(), "4");
        assert.equal(await nft.balanceOf(SECOND), "2");
        assert.equal(await nft.balanceOf(THIRD), "2");
        assert.equal(await nft.tokenOfOwnerByIndex(SECOND, "0"), "1");
        assert.equal(await nft.tokenOfOwnerByIndex(SECOND, "1"), "3");
        assert.equal(await nft.tokenOfOwnerByIndex(THIRD, "0"), "2");
        assert.equal(await nft.tokenOfOwnerByIndex(THIRD, "1"), "4");
      });

      it("shouldn't mint if not the owner", async () => {
        await truffleAssert.reverts(
          nft.mint(OWNER, TOKENS[0].multiplier, TOKENS[0].duration, TOKENS[0].averageBalance, TOKENS[0].uri, {
            from: SECOND,
          }),
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("if minted", () => {
      beforeEach(async () => {
        for (const token of TOKENS) {
          await nft.mint(token.owner, token.multiplier, token.duration, token.averageBalance, token.uri);

          token.mintedAt = await getCurrentBlockTime();
        }
      });

      describe("changeToken()", () => {
        it("should change properly", async () => {
          const first = TOKENS[0];

          const tx = await nft.changeToken(first.id, 1, 2, 3);

          truffleAssert.eventEmitted(tx, "Changed", (e) => {
            return e.tokenId.toFixed() === first.id && e.multiplier.toFixed() === "1" && e.duration.toFixed() === "2";
          });

          truffleAssert.eventEmitted(tx, "AverageBalanceChanged", (e) => {
            return e.user === first.owner && e.averageBalance.toFixed() === "3";
          });
        });

        it("should not change if not the owner", async () => {
          await truffleAssert.reverts(
            nft.changeToken(0, 0, 0, 0, { from: SECOND }),
            "Ownable: caller is not the owner"
          );
        });
      });

      describe("getExtraRewards()", () => {
        beforeEach(async () => {
          await nft.transferOwnership(govPool.address);
        });

        it("should return zero if no nft locked", async () => {
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });

        it("should return extra rewards properly", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          const amount = "5000";

          const currentMultiplier = toBN(TOKENS[2].multiplier)
            .times(PRECISION)
            .idiv(
              toBN(amount)
                .times(PRECISION)
                .times(PRECISION)
                .idiv(toBN(TOKENS[2].multiplier).times(TOKENS[2].averageBalance))
            )
            .minus(PRECISION);

          assert.equal(
            (await nft.getExtraRewards(SECOND, amount)).toFixed(),
            currentMultiplier.times(amount).idiv(PRECISION).toFixed()
          );
        });

        it("should return zero if nft is expired", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          await setTime((await getCurrentBlockTime()) + parseInt(TOKENS[2].duration) + 1);

          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });

        it("should change reward if the second nft is locked", async () => {
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });

          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "1336000");

          await nft.unlock({ from: TOKENS[0].owner });
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "500");
        });

        it("should return zero if nft is unlocked", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });
          await nft.unlock({ from: TOKENS[2].owner });

          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });
      });

      describe("getCurrentMultiplier()", () => {
        it("should return zeros if no nft locked", async () => {
          const info = await nft.getCurrentMultiplier(SECOND, 0);

          assert.equal(info.multiplier, "0");
          assert.equal(info.timeLeft, "0");
        });

        it("should return current multiplier and timeLeft properly if locked", async () => {
          await nft.transferOwnership(govPool.address);

          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          const amount = "5000";

          const currentMultiplier = toBN(TOKENS[2].multiplier)
            .times(PRECISION)
            .idiv(
              toBN(amount)
                .times(PRECISION)
                .times(PRECISION)
                .idiv(toBN(TOKENS[2].multiplier).times(TOKENS[2].averageBalance))
            )
            .minus(PRECISION)
            .plus(1)
            .toFixed();

          let info = await nft.getCurrentMultiplier(SECOND, amount);
          assert.equal(info.multiplier.toFixed(), currentMultiplier);

          const timeLeft = parseInt(TOKENS[2].duration) + TOKENS[2].mintedAt - (await getCurrentBlockTime());
          assert.equal(info.timeLeft.toFixed(), timeLeft);

          await setTime(TOKENS[2].mintedAt + parseInt(TOKENS[2].duration) - 1);

          info = await nft.getCurrentMultiplier(SECOND, amount);
          assert.equal(info.multiplier.toFixed(), currentMultiplier);
          assert.equal(info.timeLeft.toFixed(), "1");
        });

        it("should apply slashing properly", async () => {
          await nft.transferOwnership(govPool.address);

          const amount = "5000";

          const beforeUnlock = toBN(TOKENS[2].multiplier)
            .times(PRECISION)
            .idiv(
              toBN(amount)
                .times(PRECISION)
                .times(PRECISION)
                .idiv(toBN(TOKENS[2].multiplier).times(TOKENS[2].averageBalance))
            )
            .minus(PRECISION)
            .plus(1)
            .toFixed();

          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          let info = await nft.getCurrentMultiplier(SECOND, amount);
          assert.equal(info.multiplier.toFixed(), beforeUnlock);

          await nft.unlock({ from: TOKENS[2].owner });
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          TOKENS[2].multiplier = toBN(TOKENS[2].multiplier).multipliedBy(9).idiv(10);

          const afterUnlock = toBN(TOKENS[2].multiplier)
            .times(PRECISION)
            .idiv(
              toBN(amount)
                .times(PRECISION)
                .times(PRECISION)
                .idiv(toBN(TOKENS[2].multiplier).times(TOKENS[2].averageBalance))
            )
            .minus(PRECISION)
            .toFixed();

          info = await nft.getCurrentMultiplier(SECOND, amount);
          assert.equal(info.multiplier.toFixed(), afterUnlock);

          assert.isTrue(toBN(beforeUnlock).gt(afterUnlock));
        });

        it("should return zeros if nft expired", async () => {
          await nft.transferOwnership(govPool.address);

          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          await setTime((await getCurrentBlockTime()) + parseInt(TOKENS[2].duration) + 1);

          const info = await nft.getCurrentMultiplier(SECOND, 0);
          assert.equal(info.multiplier.toFixed(), "0");
          assert.equal(info.timeLeft.toFixed(), "0");
        });

        it("should return zeros if nft unlocked", async () => {
          await nft.transferOwnership(govPool.address);

          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          await nft.unlock({ from: TOKENS[2].owner });

          const info = await nft.getCurrentMultiplier(SECOND, 0);
          assert.equal(info.multiplier.toFixed(), "0");
          assert.equal(info.timeLeft.toFixed(), "0");
        });

        it("should return zero if nft multiplier is zero", async () => {
          await nft.mint(SECOND, 0, 100, 1, "");

          await nft.transferOwnership(govPool.address);

          await nft.lock(5, { from: SECOND });

          let info = await nft.getCurrentMultiplier(SECOND, "5000");
          assert.equal(info.multiplier.toFixed(), "0");
        });

        it("should return common multiplier if averageBalance is zero", async () => {
          await nft.mint(SECOND, toMultiplier(2), 100, 0, "");

          await nft.transferOwnership(govPool.address);

          await nft.lock(5, { from: SECOND });

          let info = await nft.getCurrentMultiplier(SECOND, "5000");
          assert.equal(info.multiplier.toFixed(), toMultiplier(2).toFixed());
        });

        it("should return `common multiplier - 1` if CurrentVoteBalance <= AverageBalance * multiplier", async () => {
          await nft.mint(SECOND, toMultiplier(2), 10, 1, "");

          await nft.transferOwnership(govPool.address);

          await nft.lock(5, { from: SECOND });

          let info = await nft.getCurrentMultiplier(SECOND, "0");
          assert.equal(info.multiplier.toFixed(), toMultiplier(1).toFixed());
        });

        it("should return 0 if obtained multiplier is less than 1", async () => {
          await nft.transferOwnership(govPool.address);

          await nft.lock(TOKENS[2].id, { from: SECOND });

          let info = await nft.getCurrentMultiplier(SECOND, "1000000");
          assert.equal(info.multiplier.toFixed(), "0");
        });
      });

      describe("transferFrom", () => {
        it("should not transfer averageBalance", async () => {
          await nft.transferFrom(SECOND, THIRD, TOKENS[2].id, { from: SECOND });

          await nft.lock(TOKENS[2].id, { from: THIRD });

          const amount = "7000";

          const currentMultiplier = toBN(TOKENS[2].multiplier)
            .times(PRECISION)
            .idiv(
              toBN(amount)
                .times(PRECISION)
                .times(PRECISION)
                .idiv(toBN(TOKENS[2].multiplier).times(TOKENS[3].averageBalance))
            )
            .minus(PRECISION)
            .toFixed();

          let info = await nft.getCurrentMultiplier(THIRD, amount);
          assert.equal(info.multiplier.toFixed(), currentMultiplier);

          const timeLeft = parseInt(TOKENS[2].duration) + TOKENS[2].mintedAt - (await getCurrentBlockTime());
          assert.equal(info.timeLeft.toFixed(), timeLeft);
        });
      });
    });
  });
});
