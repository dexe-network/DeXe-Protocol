const { assert } = require("chai");
const { accounts } = require("../../scripts/utils/utils");
const { setTime, getCurrentBlockTime } = require("../helpers/block-helper");
const { PRECISION } = require("../../scripts/utils/constants");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ERC721Multiplier = artifacts.require("ERC721Multiplier");

ERC721Multiplier.numberFormat = "BigNumber";

describe("ERC721Multiplier", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let nft;

  const toMultiplier = (value) => PRECISION.times(value);

  const NAME = "NFTMultiplierMock";
  const SYMBOL = "NFTMM";

  let TOKENS;

  const reverter = new Reverter();

  before(async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);

    nft = await ERC721Multiplier.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("initializer", async () => {
    it("should initialize properly if all conditions are met", async () => {
      await nft.__ERC721Multiplier_init(NAME, SYMBOL);

      assert.equal(await nft.name(), NAME);
      assert.equal(await nft.symbol(), SYMBOL);
      assert.equal(await nft.baseURI(), "");
    });

    it("should not initialize twice", async () => {
      await nft.__ERC721Multiplier_init(NAME, SYMBOL);

      await truffleAssert.reverts(
        nft.__ERC721Multiplier_init(NAME, SYMBOL),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("functionality", async () => {
    beforeEach(async () => {
      await nft.__ERC721Multiplier_init(NAME, SYMBOL);

      TOKENS = [
        {
          id: "1",
          multiplier: toMultiplier("1337").toFixed(),
          duration: "1000",
          owner: SECOND,
        },
        {
          id: "2",
          multiplier: toMultiplier("20").toFixed(),
          duration: "500",
          owner: THIRD,
        },
        {
          id: "3",
          multiplier: toMultiplier("1.5").toFixed(),
          duration: "200",
          owner: SECOND,
        },
        {
          id: "4",
          multiplier: toMultiplier("5.125").toFixed(),
          duration: "7050",
          owner: THIRD,
        },
      ];
    });

    describe("interfaceId()", () => {
      it("should support ERC721Enumerable and ERC721Multiplier interfaces", async () => {
        // TODO: change
        assert.isTrue(await nft.supportsInterface("0xf2df32c5"));
        assert.isTrue(await nft.supportsInterface("0x780e9d63"));
      });
    });

    describe("mint()", () => {
      it("shouldn't mint if not the owner", async () => {
        await truffleAssert.reverts(
          nft.mint(OWNER, TOKENS[0].multiplier, TOKENS[0].duration, { from: SECOND }),
          "Ownable: caller is not the owner"
        );
      });

      it("should mint properly", async () => {
        for (const token of TOKENS) {
          const tx = await nft.mint(token.owner, token.multiplier, token.duration);
          truffleAssert.eventEmitted(tx, "Minted", (e) => {
            return (
              e.to === token.owner &&
              e.tokenId.toFixed() === token.id &&
              e.multiplier.toFixed() === token.multiplier &&
              e.duration.toFixed() === token.duration
            );
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
    });

    describe("if minted", () => {
      beforeEach(async () => {
        for (const token of TOKENS) {
          await nft.mint(token.owner, token.multiplier, token.duration);
        }
      });

      describe("setBaseUri()", () => {
        it("should not set if not the owner", async () => {
          await truffleAssert.reverts(
            nft.setBaseUri("placeholder", { from: SECOND }),
            "Ownable: caller is not the owner"
          );
        });

        it("should set base uri properly", async () => {
          await nft.setBaseUri("placeholder");
          assert.equal(await nft.baseURI(), "placeholder");
          assert.equal(await nft.tokenURI(4), "placeholder4");
        });
      });

      describe("changeToken()", () => {
        it("should not change if not the owner", async () => {
          await truffleAssert.reverts(nft.changeToken(0, 0, 0, { from: SECOND }), "Ownable: caller is not the owner");
        });

        it("should not change if the token doesn't exist", async () => {
          await truffleAssert.reverts(nft.changeToken(5, 0, 0), "ERC721: invalid token ID");
        });

        it("should do change if the token locked", async () => {
          const first = TOKENS[0];

          await nft.lock(first.id, { from: first.owner });

          assert.isOk(await nft.changeToken(first.id, 0, 0));
        });

        it("should change properly", async () => {
          const first = TOKENS[0];

          const tx = await nft.changeToken(first.id, 1, 2);

          truffleAssert.eventEmitted(tx, "Changed", (e) => {
            return e.tokenId.toFixed() === first.id && e.multiplier.toFixed() === "1" && e.duration.toFixed() === "2";
          });
        });
      });

      describe("lock()", () => {
        it("should not lock if not the owner of the token", async () => {
          await truffleAssert.reverts(nft.lock(2, { from: SECOND }), "ERC721Multiplier: not the nft owner");
        });

        it("should not lock more than one nft simultaneously", async () => {
          const first = TOKENS[0];
          const second = TOKENS[2];

          await nft.lock(first.id, { from: first.owner });
          await truffleAssert.reverts(
            nft.lock(second.id, { from: second.owner }),
            "ERC721Multiplier: Cannot lock more than one nft"
          );
        });

        it("should lock properly if all conditions are met", async () => {
          const { id, owner, multiplier, duration } = TOKENS[0];
          const tx = await nft.lock(id, { from: owner });
          truffleAssert.eventEmitted(tx, "Locked", (e) => {
            return (
              e.sender === owner &&
              e.tokenId.toFixed() === id &&
              e.multiplier.toFixed() === multiplier &&
              e.duration.toFixed() === duration &&
              e.isLocked === true
            );
          });
          assert.equal(await nft.balanceOf(owner), 2);
          assert.equal(await nft.balanceOf(nft.address), 0);
        });

        it("should lock the second nft if the first is expired", async () => {
          const first = TOKENS[0];
          const second = TOKENS[2];

          const startTime = await getCurrentBlockTime();
          await nft.lock(first.id, { from: first.owner });

          await setTime(startTime + parseInt(first.duration) + 1);

          await nft.lock(second.id, { from: second.owner });
        });

        it("should lock the same nft after expiration", async () => {
          const first = TOKENS[0];

          const startTime = await getCurrentBlockTime();
          await nft.lock(first.id, { from: first.owner });

          await setTime(startTime + parseInt(first.duration) + 1);

          await nft.lock(first.id, { from: first.owner });
        });

        it("should lock if the token was transferred to user", async () => {
          const first = TOKENS[0];

          await nft.lock(first.id, { from: first.owner });

          await nft.unlock(first.id, { from: first.owner });

          await nft.transferFrom(first.owner, SECOND, first.id, { from: first.owner });

          await nft.lock(first.id, { from: SECOND });
        });

        it("should lock if the caller is owner of NFT", async () => {
          const { id, multiplier, duration } = TOKENS[0];
          const tx = await nft.lock(id, { from: OWNER });
          truffleAssert.eventEmitted(tx, "Locked", (e) => {
            return (
              e.sender === OWNER &&
              e.tokenId.toFixed() === id &&
              e.multiplier.toFixed() === multiplier &&
              e.duration.toFixed() === duration &&
              e.isLocked === true
            );
          });
        });
      });

      describe("unlock()", () => {
        it("should not unlock if not the owner", async () => {
          await truffleAssert.reverts(nft.unlock(2, { from: SECOND }), "ERC721Multiplier: not the nft owner");
        });

        it("should not unlock if no locked token", async () => {
          const first = TOKENS[0];
          await truffleAssert.reverts(
            nft.unlock(first.id, { from: first.owner }),
            "ERC721Multiplier: Nft is not locked"
          );

          await nft.lock(first.id, { from: first.owner });

          await nft.unlock(first.id, { from: first.owner });

          await truffleAssert.reverts(
            nft.unlock(first.id, { from: first.owner }),
            "ERC721Multiplier: Nft is not locked"
          );
        });

        it("should unlock properly if all conditions are met", async () => {
          const { id, owner, multiplier, duration } = TOKENS[0];
          await nft.lock(id, { from: owner });

          const tx = await nft.unlock(id, { from: owner });
          truffleAssert.eventEmitted(tx, "Locked", (e) => {
            return (
              e.sender === owner &&
              e.tokenId.toFixed() === id &&
              e.multiplier.toFixed() === multiplier &&
              e.duration.toFixed() === duration &&
              e.isLocked === false
            );
          });

          assert.equal(await nft.balanceOf(owner), 2);
          assert.equal(await nft.balanceOf(nft.address), 0);
        });

        it("should unlock if the caller is owner of NFT", async () => {
          const { id, owner, multiplier, duration } = TOKENS[0];
          await nft.lock(id, { from: owner });

          const tx = await nft.unlock(id, { from: OWNER });
          truffleAssert.eventEmitted(tx, "Locked", (e) => {
            return (
              e.sender === OWNER &&
              e.tokenId.toFixed() === id &&
              e.multiplier.toFixed() === multiplier &&
              e.duration.toFixed() === duration &&
              e.isLocked === false
            );
          });
        });
      });

      describe("isLocked()", () => {
        it("should return `not locked` if nft has never been locked", async () => {
          assert.isFalse(await nft.isLocked(TOKENS[0].id));
        });

        it("should return `locked` if nft is locked", async () => {
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });
          assert.isTrue(await nft.isLocked(TOKENS[0].id));
        });

        it("should return `not locked` if nft expired", async () => {
          const startTime = await getCurrentBlockTime();
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });
          await setTime(startTime + parseInt(TOKENS[0].duration) + 2);
          assert.isFalse(await nft.isLocked(TOKENS[0].id));
        });

        it("should return `not locked` if nft was unlocked", async () => {
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });

          await nft.unlock(TOKENS[0].id, { from: TOKENS[0].owner });

          assert.isFalse(await nft.isLocked(TOKENS[0].id));
        });

        it("should return `locked` if nft is locked by NFT owner", async () => {
          await nft.lock(TOKENS[0].id, { from: OWNER });
          assert.isTrue(await nft.isLocked(TOKENS[0].id));
        });

        it("should return `not locked` if nft was unlocked by NFT owner", async () => {
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });

          await nft.unlock(TOKENS[0].id, { from: OWNER });

          assert.isFalse(await nft.isLocked(TOKENS[0].id));
        });
      });

      describe("getExtraRewards()", () => {
        it("should return zero if no nft locked", async () => {
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });

        it("should return extra rewards properly", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "1500");
        });

        it("should return zero if nft is expired", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });
          await setTime((await getCurrentBlockTime()) + parseInt(TOKENS[2].duration) + 1);
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });

        it("should change reward if the second nft is locked", async () => {
          const startTime = await getCurrentBlockTime();
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "1337000");
          await setTime(startTime + parseInt(TOKENS[0].duration) + 1);
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "1500");
        });

        it("should return zero if nft is unlocked", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });
          await nft.unlock(TOKENS[2].id, { from: TOKENS[2].owner });
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });

        it("should return extra rewards properly if locked by NFT owner", async () => {
          await nft.lock(TOKENS[2].id, { from: OWNER });
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "1500");
        });

        it("should return zero if nft is unlocked by NFT owner", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });
          await nft.unlock(TOKENS[2].id, { from: OWNER });
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });
      });

      describe("getCurrentMultiplier()", () => {
        it("should return zeros if no nft locked", async () => {
          const info = await nft.getCurrentMultiplier(SECOND);
          assert.equal(info.multiplier, "0");
          assert.equal(info.timeLeft, "0");
        });

        it("should return current multiplier and timeLeft properly if locked", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          let info = await nft.getCurrentMultiplier(SECOND);
          assert.equal(info.multiplier.toFixed(), TOKENS[2].multiplier);
          assert.equal(info.timeLeft.toFixed(), TOKENS[2].duration);

          await setTime((await getCurrentBlockTime()) + parseInt(TOKENS[2].duration) - 1);

          info = await nft.getCurrentMultiplier(SECOND);
          assert.equal(info.multiplier.toFixed(), TOKENS[2].multiplier);
          assert.equal(info.timeLeft.toFixed(), "1");
        });

        it("should return zeros if nft expired", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          await setTime((await getCurrentBlockTime()) + parseInt(TOKENS[2].duration) + 1);

          const info = await nft.getCurrentMultiplier(SECOND);
          assert.equal(info.multiplier.toFixed(), "0");
          assert.equal(info.timeLeft.toFixed(), "0");
        });

        it("should return zeros if nft unlocked", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          await nft.unlock(TOKENS[2].id, { from: TOKENS[2].owner });

          const info = await nft.getCurrentMultiplier(SECOND);
          assert.equal(info.multiplier.toFixed(), "0");
          assert.equal(info.timeLeft.toFixed(), "0");
        });

        it("should return current multiplier and timeLeft properly if locked by NFT owner", async () => {
          await nft.lock(TOKENS[2].id, { from: OWNER });

          let info = await nft.getCurrentMultiplier(SECOND);
          assert.equal(info.multiplier.toFixed(), TOKENS[2].multiplier);
          assert.equal(info.timeLeft.toFixed(), TOKENS[2].duration);

          await setTime((await getCurrentBlockTime()) + parseInt(TOKENS[2].duration) - 1);

          info = await nft.getCurrentMultiplier(SECOND);
          assert.equal(info.multiplier.toFixed(), TOKENS[2].multiplier);
          assert.equal(info.timeLeft.toFixed(), "1");
        });

        it("should return zeros if nft unlocked by NFT owner", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          await nft.unlock(TOKENS[2].id, { from: OWNER });

          const info = await nft.getCurrentMultiplier(SECOND);
          assert.equal(info.multiplier.toFixed(), "0");
          assert.equal(info.timeLeft.toFixed(), "0");
        });
      });

      describe("transferFrom", () => {
        it("should not transfer if nft is locked", async () => {
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });
          await truffleAssert.reverts(
            nft.transferFrom(TOKENS[0].owner, TOKENS[1].owner, TOKENS[0].id, { from: TOKENS[0].owner }),
            "ERC721Multiplier: Cannot transfer locked token"
          );
        });

        it("should transfer if nft is not locked", async () => {
          await nft.transferFrom(TOKENS[0].owner, TOKENS[1].owner, TOKENS[0].id, { from: TOKENS[0].owner });
          assert.equal(await nft.ownerOf(TOKENS[0].id), TOKENS[1].owner);
        });

        it("should transfer if nft is unlocked", async () => {
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });

          await nft.unlock(TOKENS[0].id, { from: TOKENS[0].owner });

          await nft.transferFrom(TOKENS[0].owner, TOKENS[1].owner, TOKENS[0].id, { from: TOKENS[0].owner });
          assert.equal(await nft.ownerOf(TOKENS[0].id), TOKENS[1].owner);
        });
      });
    });
  });
});
