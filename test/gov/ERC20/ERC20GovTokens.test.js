const { assert } = require("chai");
const { accounts, wei } = require("../../../scripts/utils/utils");
const { ZERO_ADDR } = require("../../../scripts/utils/constants");
const truffleAssert = require("truffle-assertions");
const Reverter = require("../../helpers/reverter");

const ERC20GovMinimal = artifacts.require("ERC20GovMinimal");
const ERC20GovBurnable = artifacts.require("ERC20GovBurnable");
const ERC20GovPausable = artifacts.require("ERC20GovPausable");
const ERC20GovMintable = artifacts.require("ERC20GovMintable");
const ERC20GovCapped = artifacts.require("ERC20GovCapped");
const ERC20GovMintablePausable = artifacts.require("ERC20GovMintablePausable");
const ERC20GovCappedPausable = artifacts.require("ERC20GovCappedPausable");

ERC20GovMinimal.numberFormat = "BigNumber";
ERC20GovBurnable.numberFormat = "BigNumber";
ERC20GovPausable.numberFormat = "BigNumber";
ERC20GovMintable.numberFormat = "BigNumber";
ERC20GovCapped.numberFormat = "BigNumber";
ERC20GovMintablePausable.numberFormat = "BigNumber";
ERC20GovCappedPausable.numberFormat = "BigNumber";

const TOKEN_NAME = "Test token";
const TOKEN_SYMBOL = "TST";

describe("ERC20Gov", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  const reverter = new Reverter();

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);

    erc20GovMinimal = await ERC20GovMinimal.new();
    erc20GovBurnable = await ERC20GovBurnable.new();
    erc20GovPausable = await ERC20GovPausable.new();
    erc20GovMintable = await ERC20GovMintable.new();
    erc20GovCapped = await ERC20GovCapped.new();
    erc20GovMintablePausable = await ERC20GovMintablePausable.new();
    erc20GovCappedPausable = await ERC20GovCappedPausable.new();

    await erc20GovMinimal.__ERC20GovMinimal_init(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      [
        [SECOND, wei("2")],
        [THIRD, wei("3")],
      ],
      { from: THIRD },
    );

    await erc20GovBurnable.__ERC20GovBurnable_init(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      [
        [SECOND, wei("2")],
        [THIRD, wei("3")],
      ],
      { from: THIRD },
    );

    await erc20GovPausable.__ERC20GovPausable_init(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      [
        [SECOND, wei("2")],
        [THIRD, wei("3")],
      ],
      OWNER,
      { from: THIRD },
    );

    await erc20GovMintable.__ERC20GovMintable_init(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      [
        [SECOND, wei("2")],
        [THIRD, wei("3")],
      ],
      OWNER,
      { from: THIRD },
    );

    await erc20GovCapped.__ERC20GovCapped_init(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      [
        [SECOND, wei("2")],
        [THIRD, wei("3")],
      ],
      OWNER,
      wei("10"),
      { from: THIRD },
    );

    await erc20GovMintablePausable.__ERC20GovMintablePausable_init(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      [
        [SECOND, wei("2")],
        [THIRD, wei("3")],
      ],
      OWNER,
      { from: THIRD },
    );

    await erc20GovCappedPausable.__ERC20GovCappedPausable_init(
      TOKEN_NAME,
      TOKEN_SYMBOL,
      [
        [SECOND, wei("2")],
        [THIRD, wei("3")],
      ],
      OWNER,
      wei("10"),
      { from: THIRD },
    );

    INITIALIZABLE_LIST = [
      erc20GovMinimal,
      erc20GovBurnable,
      erc20GovPausable,
      erc20GovMintable,
      erc20GovCapped,
      erc20GovMintablePausable,
      erc20GovCappedPausable,
    ];
    BURNABLE_LIST = [
      erc20GovBurnable,
      erc20GovMintable,
      erc20GovCapped,
      erc20GovMintablePausable,
      erc20GovCappedPausable,
    ];
    OWNABLE_LIST = [
      erc20GovPausable,
      erc20GovMintable,
      erc20GovCapped,
      erc20GovMintablePausable,
      erc20GovCappedPausable,
    ];
    PAUSABLE_LIST = [erc20GovPausable, erc20GovMintablePausable, erc20GovCappedPausable];
    MINTABLE_LIST = [erc20GovMintable, erc20GovCapped, erc20GovMintablePausable, erc20GovCappedPausable];
    CAPPED_LIST = [erc20GovCapped, erc20GovCappedPausable];
    MINTABLE_PAUSABLE_LIST = [erc20GovMintablePausable, erc20GovCappedPausable];

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("Initialization", () => {
    it("cant initialize twice", async () => {
      await truffleAssert.reverts(
        erc20GovMinimal.__ERC20GovMinimal_init(TOKEN_NAME, TOKEN_SYMBOL, [
          [SECOND, wei("2")],
          [THIRD, wei("3")],
        ]),
        "Initializable: contract is already initialized",
      );

      await truffleAssert.reverts(
        erc20GovBurnable.__ERC20GovBurnable_init(TOKEN_NAME, TOKEN_SYMBOL, [
          [SECOND, wei("2")],
          [THIRD, wei("3")],
        ]),
        "Initializable: contract is already initialized",
      );

      await truffleAssert.reverts(
        erc20GovPausable.__ERC20GovPausable_init(
          TOKEN_NAME,
          TOKEN_SYMBOL,
          [
            [SECOND, wei("2")],
            [THIRD, wei("3")],
          ],
          OWNER,
        ),
        "Initializable: contract is already initialized",
      );

      await truffleAssert.reverts(
        erc20GovMintable.__ERC20GovMintable_init(
          TOKEN_NAME,
          TOKEN_SYMBOL,
          [
            [SECOND, wei("2")],
            [THIRD, wei("3")],
          ],
          OWNER,
        ),
        "Initializable: contract is already initialized",
      );

      await truffleAssert.reverts(
        erc20GovCapped.__ERC20GovCapped_init(
          TOKEN_NAME,
          TOKEN_SYMBOL,
          [
            [SECOND, wei("2")],
            [THIRD, wei("3")],
          ],
          OWNER,
          wei("10"),
        ),
        "Initializable: contract is already initialized",
      );

      await truffleAssert.reverts(
        erc20GovMintablePausable.__ERC20GovMintablePausable_init(
          TOKEN_NAME,
          TOKEN_SYMBOL,
          [
            [SECOND, wei("2")],
            [THIRD, wei("3")],
          ],
          OWNER,
        ),
        "Initializable: contract is already initialized",
      );

      await truffleAssert.reverts(
        erc20GovCappedPausable.__ERC20GovCappedPausable_init(
          TOKEN_NAME,
          TOKEN_SYMBOL,
          [
            [SECOND, wei("2")],
            [THIRD, wei("3")],
          ],
          OWNER,
          wei("10"),
        ),
        "Initializable: contract is already initialized",
      );
    });

    it("correct initialization", async () => {
      for (token of INITIALIZABLE_LIST) {
        assert.equal(await token.name(), TOKEN_NAME);
        assert.equal(await token.symbol(), TOKEN_SYMBOL);
        assert.equal((await token.balanceOf(SECOND)).toFixed(), wei("2"));
        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("3"));
        assert.equal((await token.totalSupply()).toFixed(), wei("5"));
      }
    });
  });

  describe("Burnable", () => {
    it("could burn from itself", async () => {
      for (token of BURNABLE_LIST) {
        await token.burn(wei("1"), { from: SECOND });
        assert.equal((await token.balanceOf(SECOND)).toFixed(), wei("1"));
        assert.equal((await token.balanceOf(THIRD)).toFixed(), wei("3"));
        assert.equal((await token.totalSupply()).toFixed(), wei("4"));
      }
    });
  });

  describe("Ownable", () => {
    it("basic ownership properties", async () => {
      for (token of OWNABLE_LIST) {
        assert.equal(await token.owner(), OWNER);

        await token.transferOwnership(SECOND);
        assert.equal(await token.owner(), SECOND);

        await token.renounceOwnership({ from: SECOND });
        assert.equal(await token.owner(), ZERO_ADDR);
      }
    });
  });

  describe("Pausable", () => {
    it("cant pause and unpause if not owner", async () => {
      for (token of PAUSABLE_LIST) {
        await truffleAssert.reverts(token.pause({ from: SECOND }), "Ownable: caller is not the owner");

        await truffleAssert.reverts(token.unpause({ from: SECOND }), "Ownable: caller is not the owner");
      }
    });

    it("cant transfer when on pause", async () => {
      for (token of PAUSABLE_LIST) {
        await token.transfer(THIRD, 1, { from: SECOND });

        await token.pause();

        await truffleAssert.reverts(
          token.transfer(THIRD, 1, { from: SECOND }),
          "ERC20Pausable: token transfer while paused",
        );

        await token.unpause();

        await token.transfer(THIRD, 1, { from: SECOND });
      }
    });
  });

  describe("Mintable", () => {
    it("cant mint if not owner", async () => {
      for (token of MINTABLE_LIST) {
        await truffleAssert.reverts(token.mint(SECOND, wei("1"), { from: SECOND }), "Ownable: caller is not the owner");
      }
    });

    it("could mint if owner", async () => {
      for (token of MINTABLE_LIST) {
        assert.equal((await token.balanceOf(SECOND)).toFixed(), wei("2"));

        await token.mint(SECOND, wei("1"));

        assert.equal((await token.balanceOf(SECOND)).toFixed(), wei("3"));
      }
    });
  });

  describe("Capped", () => {
    it("couldnt mint over cap", async () => {
      for (token of CAPPED_LIST) {
        await truffleAssert.reverts(token.mint(SECOND, wei("20")), "ERC20Capped: cap exceeded");
      }
    });
  });

  describe("Mintable pausable", () => {
    it("couldnt mint and burn during pause", async () => {
      for (token of MINTABLE_PAUSABLE_LIST) {
        await token.pause();

        await truffleAssert.reverts(token.mint(SECOND, wei("1")), "ERC20Pausable: token transfer while paused");
        await truffleAssert.reverts(token.burn(SECOND, { from: SECOND }), "ERC20Pausable: token transfer while paused");
      }
    });
  });
});
