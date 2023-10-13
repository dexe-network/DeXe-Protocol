const { assert } = require("chai");
const { accounts } = require("../../../scripts/utils/utils");
const { setTime, getCurrentBlockTime } = require("../../helpers/block-helper");
const { PRECISION } = require("../../../scripts/utils/constants");
const Reverter = require("../../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ERC721Multiplier = artifacts.require("ERC721Multiplier");
const ERC721MultiplierAttackerMock = artifacts.require("ERC721MultiplierAttackerMock");
const GovPoolMock = artifacts.require("GovPoolMock");

ERC721Multiplier.numberFormat = "BigNumber";
GovPoolMock.numberFormat = "BigNumber";

describe("ERC721Multiplier", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let nft;

  let govPool;

  let attacker;

  const toMultiplier = (value) => PRECISION.times(value);

  const NFT_NAME = "NFTMultiplierMock";
  const NFT_SYMBOL = "NFTMM";

  const reverter = new Reverter();

  before(async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);

    nft = await ERC721Multiplier.new();

    govPool = await GovPoolMock.new();

    attacker = await ERC721MultiplierAttackerMock.new();

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
      assert.equal(await nft.baseURI(), "");
    });

    it("should not initialize twice", async () => {
      await truffleAssert.reverts(
        nft.__ERC721Multiplier_init(NFT_NAME, NFT_SYMBOL),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("functionality", async () => {
    beforeEach(async () => {
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
        {
          id: "5",
          multiplier: toMultiplier("2").toFixed(),
          duration: "7050",
          owner: attacker.address,
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

        assert.equal(await nft.totalSupply(), "5");
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

          token.mintedAt = await getCurrentBlockTime();
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
          await truffleAssert.reverts(nft.changeToken(6, 0, 0), "ERC721: invalid token ID");
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
        beforeEach(async () => {
          await nft.transferOwnership(govPool.address);
        });

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
          const { id, owner } = TOKENS[0];

          const tx = await nft.lock(id, { from: owner });

          truffleAssert.eventEmitted(tx, "Locked", (e) => {
            return e.sender === owner && e.tokenId.toFixed() === id && e.isLocked === true;
          });

          assert.equal(await nft.balanceOf(owner), 2);
          assert.equal(await nft.balanceOf(nft.address), 0);
        });

        it("should lock the second nft if the first unlock", async () => {
          const first = TOKENS[0];
          const second = TOKENS[2];

          await nft.lock(first.id, { from: first.owner });

          await nft.unlock({ from: first.owner });

          await nft.lock(second.id, { from: second.owner });
        });

        it("should lock the same nft after unlock", async () => {
          const first = TOKENS[0];

          await nft.lock(first.id, { from: first.owner });

          await nft.unlock({ from: first.owner });

          await nft.lock(first.id, { from: first.owner });
        });

        it("should lock if the token was transferred to user", async () => {
          const first = TOKENS[0];

          await nft.lock(first.id, { from: SECOND });

          await nft.unlock({ from: SECOND });

          await nft.transferFrom(SECOND, THIRD, first.id, { from: SECOND });

          await nft.lock(first.id, { from: THIRD });
        });

        it("should lock another tokens if any token was unlocked and transferred from user", async () => {
          const first = TOKENS[0];

          await nft.lock(first.id, { from: SECOND });

          await nft.unlock({ from: SECOND });

          await nft.transferFrom(SECOND, THIRD, first.id, { from: SECOND });

          await nft.lock(first.id, { from: THIRD });

          const second = TOKENS[2];

          await nft.lock(second.id, { from: SECOND });
        });

        it("should lock token if it was expired", async () => {
          const first = TOKENS[0];

          await setTime(parseInt(first.duration) + first.mintedAt + 1);

          await nft.lock(first.id, { from: first.owner });

          const info = await nft.getCurrentMultiplier(first.owner);
          assert.equal(info.multiplier.toFixed(), "0");
          assert.equal(info.timeLeft.toFixed(), "0");
        });
      });

      describe("unlock()", () => {
        beforeEach(async () => {
          await nft.transferOwnership(govPool.address);
        });

        it("should not unlock if not the owner", async () => {
          await truffleAssert.reverts(nft.unlock({ from: SECOND }), "ERC721: invalid token ID");
        });

        it("should not unlock if no locked token", async () => {
          const first = TOKENS[0];
          await truffleAssert.reverts(nft.unlock({ from: first.owner }), "ERC721: invalid token ID");

          await nft.lock(first.id, { from: first.owner });

          await nft.unlock({ from: first.owner });

          await truffleAssert.reverts(nft.unlock({ from: first.owner }), "ERC721: invalid token ID");
        });

        it("should not unlock properly if zero lock time", async () => {
          const { id } = TOKENS[4];

          await truffleAssert.reverts(attacker.attackLockUnlock(nft.address, id), "BlockGuard: locked");
        });

        it("should unlock properly if all conditions are met", async () => {
          const { id, owner } = TOKENS[0];
          await nft.lock(id, { from: owner });

          const tx = await nft.unlock({ from: owner });
          truffleAssert.eventEmitted(tx, "Locked", (e) => {
            return e.sender === owner && e.tokenId.toFixed() === id && e.isLocked === false;
          });

          assert.equal(await nft.balanceOf(owner), 2);
          assert.equal(await nft.balanceOf(nft.address), 0);
        });

        it("should unlock properly if token was unlocked", async () => {
          const { id, owner } = TOKENS[0];
          await nft.lock(id, { from: owner });

          await nft.unlock({ from: owner });

          await nft.lock(id, { from: owner });

          await nft.unlock({ from: owner });
        });

        it("should not unlock if caller has active proposal", async () => {
          const first = TOKENS[0];
          await nft.lock(first.id, { from: first.owner });

          await govPool.setUserActiveProposalsCount(1);

          await truffleAssert.reverts(
            nft.unlock({ from: first.owner }),
            "ERC721Multiplier: Cannot unlock with active proposals"
          );
        });
      });

      describe("isLocked()", () => {
        beforeEach(async () => {
          await nft.transferOwnership(govPool.address);
        });

        it("should return `not locked` if nft has never been locked", async () => {
          assert.isFalse(await nft.isLocked(TOKENS[0].id));
        });

        it("should return `locked` if nft is locked", async () => {
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });
          assert.isTrue(await nft.isLocked(TOKENS[0].id));
        });

        it("should return `locked` if nft expired", async () => {
          const startTime = await getCurrentBlockTime();

          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });

          await setTime(startTime + parseInt(TOKENS[0].duration) + 2);

          assert.isTrue(await nft.isLocked(TOKENS[0].id));
        });

        it("should return `not locked` if nft was unlocked", async () => {
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });

          await nft.unlock({ from: TOKENS[0].owner });

          assert.isFalse(await nft.isLocked(TOKENS[0].id));
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
          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "1500");
        });

        it("should return zero if nft is expired", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          await setTime((await getCurrentBlockTime()) + parseInt(TOKENS[2].duration) + 1);

          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });

        it("should change reward if the second nft is locked", async () => {
          await nft.lock(TOKENS[0].id, { from: TOKENS[0].owner });

          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "1337000");

          await nft.unlock({ from: TOKENS[0].owner });
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "1500");
        });

        it("should return zero if nft is unlocked", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });
          await nft.unlock({ from: TOKENS[2].owner });

          assert.equal(await nft.getExtraRewards(SECOND, "1000"), "0");
        });
      });

      describe("getCurrentMultiplier()", () => {
        beforeEach(async () => {
          await nft.transferOwnership(govPool.address);
        });

        it("should return zeros if no nft locked", async () => {
          const info = await nft.getCurrentMultiplier(SECOND);

          assert.equal(info.multiplier, "0");
          assert.equal(info.timeLeft, "0");
        });

        it("should return current multiplier and timeLeft properly if locked", async () => {
          await nft.lock(TOKENS[2].id, { from: TOKENS[2].owner });

          let info = await nft.getCurrentMultiplier(SECOND);
          assert.equal(info.multiplier.toFixed(), TOKENS[2].multiplier);
          const timeLeft = parseInt(TOKENS[2].duration) + TOKENS[2].mintedAt - (await getCurrentBlockTime());
          assert.equal(info.timeLeft.toFixed(), timeLeft);

          await setTime((await getCurrentBlockTime()) + timeLeft - 1);

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

          await nft.unlock({ from: TOKENS[2].owner });

          const info = await nft.getCurrentMultiplier(SECOND);
          assert.equal(info.multiplier.toFixed(), "0");
          assert.equal(info.timeLeft.toFixed(), "0");
        });

        it("should not change timeLeft if nft was transferred", async () => {
          await nft.transferFrom(TOKENS[0].owner, TOKENS[1].owner, TOKENS[0].id, { from: TOKENS[0].owner });

          await nft.lock(TOKENS[0].id, { from: TOKENS[1].owner });

          let info = await nft.getCurrentMultiplier(TOKENS[1].owner);

          assert.equal(info.multiplier.toFixed(), TOKENS[0].multiplier);

          const timeLeft = parseInt(TOKENS[0].duration) + TOKENS[0].mintedAt - (await getCurrentBlockTime());
          assert.equal(info.timeLeft.toFixed(), timeLeft);
        });
      });

      describe("transferFrom", () => {
        beforeEach(async () => {
          await nft.transferOwnership(govPool.address);
        });

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

          await nft.unlock({ from: TOKENS[0].owner });

          await nft.transferFrom(TOKENS[0].owner, TOKENS[1].owner, TOKENS[0].id, { from: TOKENS[0].owner });
          assert.equal(await nft.ownerOf(TOKENS[0].id), TOKENS[1].owner);
        });
      });
    });
  });
});
