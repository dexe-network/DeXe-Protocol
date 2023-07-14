const { assert } = require("chai");
const { accounts } = require("../../scripts/utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");

const ERC721Expert = artifacts.require("ERC721Expert");

ERC721Expert.numberFormat = "BigNumber";

const BURNAUTH_OWNER = 1;

describe("ERC721Expert", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let nft;

  const NAME = "NFTExpertMock";
  const SYMBOL = "NFTEM";

  const reverter = new Reverter();

  before(async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);

    nft = await ERC721Expert.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("initializer", async () => {
    it("should initialize properly if all conditions are met", async () => {
      await nft.__ERC721Expert_init(NAME, SYMBOL);

      assert.equal(await nft.name(), NAME);
      assert.equal(await nft.symbol(), SYMBOL);
    });

    it("should not initialize twice", async () => {
      await nft.__ERC721Expert_init(NAME, SYMBOL);

      await truffleAssert.reverts(
        nft.__ERC721Expert_init(NAME, SYMBOL),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("functionality", async () => {
    beforeEach(async () => {
      await nft.__ERC721Expert_init(NAME, SYMBOL);

      TOKENS = [
        {
          id: "1",
          uri: "URI1",
          owner: SECOND,
        },
        {
          id: "2",
          uri: "URI2",
          owner: THIRD,
        },
        {
          id: "3",
          uri: "URI3",
          owner: SECOND,
        },
        {
          id: "4",
          uri: "URI4",
          owner: THIRD,
        },
      ];
    });

    async function mint(token, issuer) {
      await nft.mint(token.owner, token.uri, { from: issuer });
    }

    async function burn(token, burner) {
      await nft.burn(token.id, { from: burner });
    }

    async function setTags(token, tags, setter) {
      await nft.setTags(token.id, tags, { from: setter });
    }

    async function badgeExists(contract, token) {
      assert.equal(await contract.isExpert(token.owner), true);
      assert.equal(await contract.getIdByExpert(token.owner), token.id);
      assert.equal(await contract.burnAuth(token.id), BURNAUTH_OWNER);
      assert.equal(await contract.balanceOf(token.owner), 1);
      assert.equal(await contract.tokenURI(token.id), token.uri);
    }

    async function badgeNotExists(contract, token) {
      assert.equal(await contract.isExpert(token.owner), false);

      await truffleAssert.reverts(contract.getIdByExpert(token.owner), "ERC721Expert: User is not an expert");
      await truffleAssert.reverts(
        contract.burnAuth(token.id),
        "ERC721Expert: Cannot find Burn Auth for non existant badge"
      );

      assert.equal(await contract.balanceOf(token.owner), 0);

      await truffleAssert.reverts(contract.tokenURI(token.id), "ERC721URIStorage: URI query for nonexistent token");
    }

    describe("interfaceId()", () => {
      it("should support ERC165, ERC721, ERC721Metadata, ERC5484 interfaces", async () => {
        assert.isTrue(await nft.supportsInterface("0x01ffc9a7"));
        assert.isTrue(await nft.supportsInterface("0x80ac58cd"));
        assert.isTrue(await nft.supportsInterface("0x5b5e139f"));
        assert.isTrue(await nft.supportsInterface("0x0489b56f"));
        assert.isTrue(await nft.supportsInterface("0x966376c5"));
      });
    });

    describe("mint()", () => {
      it("shouldn't mint if not the owner", async () => {
        await truffleAssert.reverts(mint(TOKENS[0], SECOND), "Ownable: caller is not the owner");
      });

      it("should mint correctly", async () => {
        let token = TOKENS[0];

        await badgeNotExists(nft, token);
        await mint(token, OWNER);
        await badgeExists(nft, token);
      });

      it("emits issued", async () => {
        let token = TOKENS[0];

        const tx = await nft.mint(token.owner, token.uri, { from: OWNER });

        truffleAssert.eventEmitted(tx, "Issued", (e) => {
          return (
            e.from === OWNER &&
            e.to === token.owner &&
            e.tokenId.toFixed() === token.id &&
            e.burnAuth.toFixed() === BURNAUTH_OWNER.toString(10)
          );
        });
      });

      it("cannot mint twice to the same address", async () => {
        await mint(TOKENS[0], OWNER);
        await truffleAssert.reverts(mint(TOKENS[2], OWNER), "ERC721Expert: Cannot mint more than one expert badge");
      });
    });

    describe("setTokenUri()", () => {
      it("cannot set URI for not existant badge", async () => {
        let token = TOKENS[0];

        await mint(token, OWNER);
        await truffleAssert.reverts(
          nft.setTokenURI(TOKENS[1].id, "URI256"),
          "ERC721URIStorage: URI set of nonexistent token"
        );
      });

      it("cannot set URI if not owner", async () => {
        let token = TOKENS[0];

        await mint(token, OWNER);
        await truffleAssert.reverts(
          nft.setTokenURI(token.id, "URI256", { from: SECOND }),
          "Ownable: caller is not the owner"
        );
      });

      it("can set URI", async () => {
        let token = TOKENS[0];

        await mint(token, OWNER);

        let newUri = "URI256";

        await nft.setTokenURI(token.id, newUri, { from: OWNER });

        assert.equal(await nft.tokenURI(token.id), newUri);
      });
    });

    describe("transfer()", () => {
      it("shouldn't transfer non existant badge", async () => {
        await mint(TOKENS[0], OWNER);
        await truffleAssert.reverts(
          nft.transferFrom(SECOND, THIRD, 1, { from: SECOND }),
          "ERC721Expert: Expert badge cannot be transferred"
        );
      });

      it("shouldn't transfer any badge", async () => {
        await truffleAssert.reverts(nft.transferFrom(OWNER, SECOND, 1), "ERC721: operator query for nonexistent token");
      });
    });

    describe("burn()", () => {
      it("could not burn if not owner", async () => {
        let token = TOKENS[0];

        await mint(token, OWNER);
        await truffleAssert.reverts(burn(token, SECOND), "Ownable: caller is not the owner");
      });

      it("should burn correctly", async () => {
        let token = TOKENS[0];

        await mint(token, OWNER);
        await badgeExists(nft, token);

        await burn(token, OWNER);
        await badgeNotExists(nft, token);
      });

      it("could not burn non existant badge", async () => {
        let token = TOKENS[0];

        await truffleAssert.reverts(burn(token, OWNER), "ERC721Expert: Cannot burn non-existent badge");
      });

      it("keeps correct order of creation", async () => {
        for (let i = 0; i < 2; i++) {
          let token = TOKENS[i];

          await mint(token, OWNER);
          await badgeExists(nft, token);
        }

        for (let i = 0; i < 2; i++) {
          let token = TOKENS[i];

          await burn(token, OWNER);
          await badgeNotExists(nft, token);
        }

        for (let i = 2; i < 4; i++) {
          let token = TOKENS[i];

          await mint(token, OWNER);
          await badgeExists(nft, token);
        }

        for (let i = 2; i < 4; i++) {
          let token = TOKENS[i];

          await burn(token, OWNER);
          await badgeNotExists(nft, token);
        }
      });
    });

    describe("tags", () => {
      beforeEach(async () => {
        await mint(TOKENS[0], OWNER);
        TAGS = ["TAG0", "TAG1", "TAG2", "TAG3"];
      });

      it("could not set tags if not owner", async () => {
        await truffleAssert.reverts(setTags(TOKENS[0], TAGS.slice(1), SECOND), "Ownable: caller is not the owner");
      });

      it("could not set tags to non-existant badge", async () => {
        await truffleAssert.reverts(
          setTags(TOKENS[1], TAGS.slice(1), OWNER),
          "ERC721Expert: Cannot set tags to non-existent badge"
        );
      });

      it("could not set more than 3 tags", async () => {
        await truffleAssert.reverts(setTags(TOKENS[0], TAGS, OWNER), "ERC721Expert: Too much tags");
      });

      it("sets tags correctly", async () => {
        await setTags(TOKENS[0], TAGS.slice(1), OWNER);
        let tagsAfter = await nft.getTags(TOKENS[0].id);
        assert.deepEqual(tagsAfter, TAGS.slice(1));

        for (let i = 0; i < 2; i++) {
          for (let j = 1; j <= 3; j++) {
            await setTags(TOKENS[0], TAGS.slice(i, i + j), OWNER);
            tagsAfter = await nft.getTags(TOKENS[0].id);
            assert.deepEqual(tagsAfter, TAGS.slice(i, i + j));
          }
        }

        await setTags(TOKENS[0], [], OWNER);
        tagsAfter = await nft.getTags(TOKENS[0].id);
        assert.deepEqual(tagsAfter, []);
      });

      it("no tags after burn", async () => {
        await setTags(TOKENS[0], TAGS.slice(1), OWNER);
        await burn(TOKENS[0], OWNER);
        let tagsAfter = await nft.getTags(TOKENS[0].id);
        assert.deepEqual(tagsAfter, []);
      });
    });
  });
});
