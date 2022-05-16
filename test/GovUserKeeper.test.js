const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");

const GovUserKeeper = artifacts.require("GovUserKeeper");
const ERC20Mock = artifacts.require("ERC20Mock");
const ERC721Mock = artifacts.require("ERC721Mock");
const ERC721EnumMock = artifacts.require("ERC721EnumerableMock");
const ERC721Power = artifacts.require("ERC721Power");

GovUserKeeper.numberFormat = "BigNumber";
ERC20Mock.numberFormat = "BigNumber";
ERC721Mock.numberFormat = "BigNumber";
ERC721EnumMock.numberFormat = "BigNumber";
ERC721Power.numberFormat = "BigNumber";

describe("GovUserKeeper", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let userKeeper;
  let token;
  let nft;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
  });

  beforeEach("setup", async () => {
    token = await ERC20Mock.new("Mock", "Mock", 18);
    userKeeper = await GovUserKeeper.new();
  });

  describe("Plain GovUserKeeper", () => {
    beforeEach("setup", async () => {
      nft = await ERC721Mock.new("Mock", "Mock");

      await userKeeper.__GovUserKeeper_init(token.address, nft.address, wei("33000"), 33);

      await token.mint(OWNER, wei("1000000"));

      for (let i = 1; i < 10; i++) {
        await nft.safeMint(OWNER, i);
        await nft.approve(userKeeper.address, i);
      }
    });

    describe("init", () => {
      it("should correctly set initial parameters", async () => {
        assert.equal(await userKeeper.tokenAddress(), token.address);
        assert.equal(await userKeeper.nftAddress(), nft.address);

        const nftInfo = await userKeeper.getNftContractInfo();

        assert.isFalse(nftInfo.supportPower);
        assert.isFalse(nftInfo.supportTotalSupply);
        assert.equal(nftInfo.totalPowerInTokens.toFixed(), wei("33000"));
        assert.equal(nftInfo.totalSupply, "33");
      });
    });

    describe("depositTokens()", async () => {
      it("should correctly add tokens to balance", async () => {
        await token.approve(userKeeper.address, wei("1000"));

        await userKeeper.depositTokens(SECOND, wei("100"));
        assert.equal((await userKeeper.tokenBalanceOf(SECOND))[0].toFixed(), wei("100"));

        await userKeeper.depositTokens(SECOND, wei("200"));
        assert.equal((await userKeeper.tokenBalanceOf(SECOND))[0].toFixed(), wei("300"));

        await userKeeper.depositTokens(OWNER, wei("10"));
        assert.equal((await userKeeper.tokenBalanceOf(OWNER))[0].toFixed(), wei("10"));
      });
    });

    describe("depositNfts()", () => {
      it("should correctly add tokens to balance", async () => {
        await userKeeper.depositNfts(SECOND, [1, 3, 5]);

        let balance = await userKeeper.nftBalanceOf(SECOND, 0, 10);
        assert.deepEqual(
          balance.map((e) => e.toFixed()),
          ["1", "3", "5"]
        );

        await userKeeper.depositNfts(SECOND, [2, 4]);

        balance = await userKeeper.nftBalanceOf(SECOND, 0, 10);
        assert.deepEqual(
          balance.map((e) => e.toFixed()),
          ["1", "3", "5", "2", "4"]
        );

        await userKeeper.depositNfts(OWNER, [6, 9]);

        balance = await userKeeper.nftBalanceOf(OWNER, 0, 10);
        assert.deepEqual(
          balance.map((e) => e.toFixed()),
          ["6", "9"]
        );
      });
    });
  });
});
