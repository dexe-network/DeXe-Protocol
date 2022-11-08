const { assert } = require("chai");
const { toBN, accounts, wei, precision } = require("../scripts/utils/utils");
const { setTime, getCurrentBlockTime } = require("./helpers/block-helper");
const { PRECISION, ZERO_ADDR } = require("../scripts/utils/constants");
const truffleAssert = require("truffle-assertions");

const ERC721Multiplier = artifacts.require("ERC721Multiplier");

ERC721Multiplier.numberFormat = "BigNumber";

describe.only("ERC721Multiplier", () => {
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
        id: 1,
        multiplier: toMultiplier("1337").toFixed(),
        duration: 1000,
        owner: SECOND,
      },
      {
        id: 2,
        multiplier: toMultiplier("20").toFixed(),
        duration: 500,
        owner: THIRD,
      },
      {
        id: 3,
        multiplier: toMultiplier("1.5").toFixed(),
        duration: 200,
        owner: SECOND,
      },
      {
        id: 4,
        multiplier: toMultiplier("5.125").toFixed(),
        duration: 7050,
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

  describe("mint()", async () => {
    it("shouldn't mint if not the owner", async () => {
      await truffleAssert.reverts(
        nft.mint(OWNER, toMultiplier(1337), 1000, { from: SECOND }),
        "Ownable: caller is not the owner"
      );
    });

    it("should be zero totalSupply before minting", async () => {
      assert.equal(await nft.totalSupply(), 0);
    });

    it("should mint properly", async () => {
      for (const token of TOKENS) {
        await nft.mint(token.owner, token.multiplier, token.duration);
      }

      assert.equal(await nft.totalSupply(), 4);
      assert.equal(await nft.balanceOf(SECOND), 2);
      assert.equal(await nft.balanceOf(THIRD), 2);
      assert.equal(await nft.tokenOfOwnerByIndex(SECOND, 0), 1);
      assert.equal(await nft.tokenOfOwnerByIndex(SECOND, 1), 3);
      assert.equal(await nft.tokenOfOwnerByIndex(THIRD, 0), 2);
      assert.equal(await nft.tokenOfOwnerByIndex(THIRD, 1), 4);
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
  });
});
