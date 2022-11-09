const { assert } = require("chai");
const { accounts } = require("../scripts/utils/utils");
const { setTime, getCurrentBlockTime } = require("./helpers/block-helper");
const { PRECISION } = require("../scripts/utils/constants");
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

  before(async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);

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

  beforeEach(async () => {
    nft = await ERC721Multiplier.new(NAME, SYMBOL);
  });

  it("should setup correctly", async () => {
    assert.equal(await nft.name(), NAME);
    assert.equal(await nft.symbol(), SYMBOL);
    assert.equal(await nft.baseURI(), "");
  });

  describe("interfaceId()", () => {
    it("should support ERC721Enumerable and ERC721Multiplier interfaces", async () => {
      assert.isTrue(await nft.supportsInterface("0x2aabfe18"));
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

    it("should be zero totalSupply before minting", async () => {
      assert.equal(await nft.totalSupply(), "0");
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

    describe("lock()", () => {
      it("should not lock if not the owner of the token", async () => {
        await truffleAssert.reverts(nft.lock(2, { from: SECOND }), "ERC721: transfer from incorrect owner");
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
            e.from === owner &&
            e.tokenId.toFixed() === id &&
            e.multiplier.toFixed() === multiplier &&
            e.duration.toFixed() === duration
          );
        });
        assert.equal(await nft.balanceOf(owner), 1);
        assert.equal(await nft.balanceOf(nft.address), 1);
      });

      it("should lock the second nft if the first is expired", async () => {
        const first = TOKENS[0];
        const second = TOKENS[2];

        const startTime = await getCurrentBlockTime();
        await nft.lock(first.id, { from: first.owner });

        await setTime(startTime + parseInt(first.duration) + 1);

        await nft.lock(second.id, { from: second.owner });
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
    });
  });
});
