const { assert } = require("chai");
const { toBN, accounts, wei } = require("../scripts/helpers/utils");
const truffleAssert = require("truffle-assertions");
const { getCurrentBlockTime, setTime } = require("./helpers/hardhatTimeTraveller");

const GovValidators = artifacts.require("GovValidators");
const GovValidatorsToken = artifacts.require("GovValidatorsToken");

GovValidators.numberFormat = "BigNumber";
GovValidatorsToken.numberFormat = "BigNumber";

const ZERO = "0x0000000000000000000000000000000000000000";
const PRECISION = toBN(10).pow(25);

function toPercent(num) {
  return PRECISION.times(num).toFixed();
}

describe("GovValidators", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let validators;
  let validatorsToken;

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);
  });

  describe("invalid Validators", () => {
    beforeEach("setup", async () => {
      validators = await GovValidators.new();
    });

    describe("constructor()", () => {
      it("should revert if invalid array length (1)", async () => {
        await truffleAssert.reverts(
          validators.__GovValidators_init(
            "Validator Token",
            "VT",
            500,
            PRECISION.times("51").toFixed(),
            [SECOND],
            [wei("100"), wei("200")]
          ),
          "Validators: invalid array length"
        );
      });

      it("should revert if invalid duration value", async () => {
        await truffleAssert.reverts(
          validators.__GovValidators_init(
            "Validator Token",
            "VT",
            0,
            PRECISION.times("51").toFixed(),
            [SECOND],
            [wei("100")]
          ),
          "Validators: duration is zero"
        );
      });

      it("should revert if invalid quorum value", async () => {
        await truffleAssert.reverts(
          validators.__GovValidators_init(
            "Validator Token",
            "VT",
            100,
            PRECISION.times("101").toFixed(),
            [SECOND],
            [wei("100")]
          ),
          "Validators: invalid quorum value"
        );
      });
    });
  });

  describe("valid Validators", () => {
    beforeEach("setup", async () => {
      validators = await GovValidators.new();

      await validators.__GovValidators_init(
        "Validator Token",
        "VT",
        500,
        PRECISION.times("51").toFixed(),
        [SECOND, THIRD],
        [wei("100"), wei("200")]
      );

      validatorsToken = await GovValidatorsToken.at(await validators.govValidatorsToken());
    });

    describe("ValidatorsToken", () => {
      it("should revert on transfer", async () => {
        await truffleAssert.reverts(
          validatorsToken.transfer(THIRD, "10", { from: SECOND }),
          "ValidatorsToken: caller is not the validator"
        );
      });

      it("only owner should call mint(), burn(), snapshot()", async () => {
        await truffleAssert.reverts(
          validatorsToken.mint(SECOND, "10", { from: SECOND }),
          "ValidatorsToken: caller is not the validator"
        );
        await truffleAssert.reverts(
          validatorsToken.burn(SECOND, "10", { from: SECOND }),
          "ValidatorsToken: caller is not the validator"
        );
        await truffleAssert.reverts(
          validatorsToken.snapshot({ from: SECOND }),
          "ValidatorsToken: caller is not the validator"
        );
      });
    });

    describe("constructor()", () => {
      it("should setup constructor params", async () => {
        const internalProposalSettings = await validators.internalProposalSettings();

        assert.equal(internalProposalSettings.duration, 500);
        assert.equal(toBN(internalProposalSettings.quorum).toFixed(), toPercent("51"));
        assert.equal(await validatorsToken.balanceOf(SECOND), wei("100"));
        assert.equal(await validatorsToken.balanceOf(THIRD), wei("200"));
      });
    });

    describe("createInternalProposal()", () => {
      it("should create internal proposals", async () => {
        let currentTime = await getCurrentBlockTime();

        await validators.createInternalProposal(0, [13], [OWNER], { from: SECOND });

        const internal = await validators.internalProposals(1);

        assert.equal(internal.proposalType, 0);
        assert.equal(internal.core.voteEnd, currentTime + 500 + 1);
        assert.isFalse(internal.core.executed);
        assert.equal(internal.core.quorum, toPercent("51"));
        assert.equal(internal.core.votesFor, 0);
        assert.equal(internal.core.snapshotId, 1);
      });

      it("should revert when arrays lengths not equals", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(3, [13, 15], [OWNER], { from: SECOND }),
          "Validators: invalid length"
        );
      });

      it("should revert if aller is not the validator", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(0, [13], []),
          "Validators: caller is not the validator"
        );
      });

      it("should revert if invalid duration value", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(0, [0], [], { from: SECOND }),
          "Validators: invalid duration value"
        );
      });

      it("should revert if invalid quorum value", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(1, [toPercent(101)], [OWNER], { from: SECOND }),
          "Validators: invalid quorum value"
        );
      });

      it("should revert if invalid values", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(2, [1, toPercent(101)], [], { from: SECOND }),
          "Validators: invalid duration or quorum values"
        );
      });

      it("should revert if invalid address", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(3, [0], [ZERO], { from: SECOND }),
          "Validators: invalid address"
        );
      });
    });

    describe("createExternalProposal()", () => {
      it("should correctly create external proposals", async () => {
        let currentTime = await getCurrentBlockTime();

        await validators.createExternalProposal(1, 33, 66);

        const external = await validators.externalProposals(1);
        assert.equal(external.voteEnd, currentTime + 33 + 1);
        assert.equal(external.executed, false);
        assert.equal(external.quorum, 66);
        assert.equal(external.votesFor, 0);
        assert.equal(external.snapshotId, 1);
      });

      it("should revert if caller is not the owner", async () => {
        await truffleAssert.reverts(
          validators.createExternalProposal(1, 1, 1, { from: SECOND }),
          "Ownable: caller is not the owner"
        );
      });

      it("should revert if proposal already exists", async () => {
        await validators.createExternalProposal(1, 1, 1);
        await truffleAssert.reverts(validators.createExternalProposal(1, 1, 1), "Validators: proposal already exist");
      });
    });

    describe("vote()", () => {
      it("should vote with existed balance, internal proposals", async () => {
        await validators.createInternalProposal(0, [100], [], { from: SECOND });

        await validators.vote(1, wei("40"), true, { from: SECOND });
        assert.equal(await validators.addressVotedInternal(1, SECOND), wei("40"));
        assert.equal(await validators.addressVotedInternal(1, THIRD), wei("0"));
        assert.equal((await validators.internalProposals(1)).core.votesFor, wei("40"));

        await validators.vote(1, wei("50"), true, { from: THIRD });
        assert.equal(await validators.addressVotedInternal(1, SECOND), wei("40"));
        assert.equal(await validators.addressVotedInternal(1, THIRD), wei("50"));
        assert.equal((await validators.internalProposals(1)).core.votesFor, wei("90"));

        await validators.vote(1, wei("60"), true, { from: SECOND });
        assert.equal(await validators.addressVotedInternal(1, SECOND), wei("100"));
        assert.equal(await validators.addressVotedInternal(1, THIRD), wei("50"));
        assert.equal((await validators.internalProposals(1)).core.votesFor, wei("150"));
      });

      it("should vote when amount more than balance, internal proposals", async () => {
        await validators.createInternalProposal(0, [100], [], { from: SECOND });

        await validators.vote(1, wei("300"), true, { from: SECOND });

        assert.equal(await validators.addressVotedInternal(1, SECOND), wei("100"));
        assert.equal(await validators.addressVotedInternal(1, THIRD), wei("0"));
        assert.equal((await validators.internalProposals(1)).core.votesFor, wei("100"));

        await validators.vote(1, wei("300"), true, { from: THIRD });

        assert.equal(await validators.addressVotedInternal(1, SECOND), wei("100"));
        assert.equal(await validators.addressVotedInternal(1, THIRD), wei("200"));
        assert.equal((await validators.internalProposals(1)).core.votesFor, wei("300"));
      });

      it("should correctly vote by snapshot balance, internal proposals", async () => {
        await validators.createInternalProposal(0, [100], [], { from: SECOND });
        await validators.createInternalProposal(3, [wei("40"), wei("60")], [SECOND, THIRD], { from: SECOND });

        await validators.vote(2, wei("1000"), true, { from: THIRD });

        await validators.execute(2);

        assert.equal(await validatorsToken.balanceOf(SECOND), wei("40"));
        assert.equal(await validatorsToken.balanceOf(THIRD), wei("60"));

        await validators.vote(1, wei("1000"), true, { from: SECOND });
        await validators.vote(1, wei("1000"), true, { from: THIRD });

        assert.equal(await validators.addressVotedInternal(1, SECOND), wei("100"));
        assert.equal(await validators.addressVotedInternal(1, THIRD), wei("200"));
        assert.equal((await validators.internalProposals(1)).core.votesFor, wei("300"));

        await validators.createInternalProposal(0, [10], [], { from: SECOND });

        await validators.vote(3, wei("1000"), true, { from: SECOND });
        await validators.vote(3, wei("1000"), true, { from: THIRD });

        assert.equal(await validators.addressVotedInternal(3, SECOND), wei("40"));
        assert.equal(await validators.addressVotedInternal(3, THIRD), wei("60"));
        assert.equal((await validators.internalProposals(3)).core.votesFor, wei("100"));
      });

      it("should vote with existed balance, external proposals", async () => {
        await validators.createExternalProposal(2, 1000, toPercent("51"));

        await validators.vote(2, wei("40"), false, { from: SECOND });

        assert.equal(await validators.addressVotedExternal(2, SECOND), wei("40"));
        assert.equal(await validators.addressVotedExternal(2, THIRD), wei("0"));
        assert.equal((await validators.externalProposals(2)).votesFor, wei("40"));

        await validators.vote(2, wei("50"), false, { from: THIRD });

        assert.equal(await validators.addressVotedExternal(2, SECOND), wei("40"));
        assert.equal(await validators.addressVotedExternal(2, THIRD), wei("50"));
        assert.equal((await validators.externalProposals(2)).votesFor, wei("90"));

        await validators.vote(2, wei("1000"), false, { from: SECOND });

        assert.equal(await validators.addressVotedExternal(2, SECOND), wei("100"));
        assert.equal(await validators.addressVotedExternal(2, THIRD), wei("50"));
        assert.equal((await validators.externalProposals(2)).votesFor, wei("150"));
      });

      it("should revert if proposal is not exist", async () => {
        await truffleAssert.reverts(validators.vote(1, 1, false), "Validators: proposal does not exist");
      });

      it("should revert if only by `Voting` state", async () => {
        await validators.createInternalProposal(0, [100], [], { from: SECOND });
        await validators.vote(1, wei("1000"), true, { from: THIRD });

        await truffleAssert.reverts(validators.vote(1, 1, true), "Validators: only by `Voting` state");
      });

      it("should revert if vote amount can't be a zero", async () => {
        await validators.createInternalProposal(0, [100], [], { from: SECOND });
        await validators.vote(1, wei("1000"), true, { from: SECOND });

        await truffleAssert.reverts(
          validators.vote(1, 1, true, { from: SECOND }),
          "Validators: vote amount can't be a zero"
        );
      });
    });

    describe("getProposalState()", () => {
      it("should correctly return `Voting` state and `Succeeded` state when quorum reached", async () => {
        await validators.createInternalProposal(0, [100], [], { from: SECOND });

        await validators.vote(1, wei("100"), true, { from: SECOND });
        await validators.vote(1, wei("52"), true, { from: THIRD });

        assert.equal(await validators.getProposalState(1, true), 0);

        await validators.vote(1, wei("1"), true, { from: THIRD });
        assert.equal(await validators.getProposalState(1, true), 2);
      });

      it("should correctly return `Defeated`", async () => {
        let currentTime = await getCurrentBlockTime();
        await validators.createInternalProposal(0, [100], [], { from: SECOND });

        await validators.vote(1, wei("100"), true, { from: SECOND });
        await validators.vote(1, wei("52"), true, { from: THIRD });

        await setTime(currentTime + 501);
        assert.equal((await validators.getProposalState(1, true)).toFixed(), "0");

        await setTime(currentTime + 502);
        assert.equal((await validators.getProposalState(1, true)).toFixed(), "1");
      });

      it("should correctly return `Executed` state", async () => {
        await validators.createInternalProposal(0, [100], [], { from: SECOND });
        await validators.vote(1, wei("100"), true, { from: SECOND });
        await validators.vote(1, wei("53"), true, { from: THIRD });

        await validators.execute(1);

        assert.equal(await validators.getProposalState(1, true), 3);
      });

      it("should correctly return `Undefined` state", async () => {
        assert.equal(await validators.getProposalState(2, true), 4);
        assert.equal(await validators.getProposalState(2, false), 4);
      });
    });

    describe("execute()", () => {
      it("should correctly execute `ChangeInternalDuration` proposal", async () => {
        await validators.createInternalProposal(0, [1500], [], { from: SECOND });
        await validators.vote(1, wei("200"), true, { from: SECOND });
        await validators.vote(1, wei("200"), true, { from: THIRD });

        await validators.execute(1);

        assert.equal((await validators.internalProposalSettings()).duration, 1500);

        await validators.createInternalProposal(0, [333], [], { from: THIRD });
        await validators.vote(2, wei("200"), true, { from: SECOND });
        await validators.vote(2, wei("200"), true, { from: THIRD });

        await validators.execute(2);

        assert.equal((await validators.internalProposalSettings()).duration, 333);
      });

      it("should correctly execute `ChangeInternalQuorum` proposal", async () => {
        await validators.createInternalProposal(1, [toPercent("20")], [], { from: SECOND });
        await validators.vote(1, wei("200"), true, { from: SECOND });
        await validators.vote(1, wei("200"), true, { from: THIRD });

        await validators.execute(1);

        assert.equal((await validators.internalProposalSettings()).quorum.toFixed(), toPercent("20"));

        await validators.createInternalProposal(2, [50, toPercent("15")], [], { from: THIRD });

        await validators.vote(2, wei("200"), true, { from: SECOND });

        await validators.execute(2);

        assert.equal((await validators.internalProposalSettings()).duration.toFixed(), "50");
        assert.equal((await validators.internalProposalSettings()).quorum.toFixed(), toPercent("15"));
      });

      it("should correctly execute `ChangeBalances` proposal", async () => {
        assert.isFalse(await validators.isQuorumReached(1, true));

        await validators.createInternalProposal(3, [wei("200")], [SECOND], { from: SECOND });
        await validators.vote(1, wei("200"), true, { from: THIRD });

        assert.isTrue(await validators.isQuorumReached(1, true));

        await validators.execute(1);

        assert.equal((await validatorsToken.balanceOf(SECOND)).toFixed(), wei("200"));

        await validators.createInternalProposal(3, [wei("0")], [SECOND], { from: SECOND });
        await validators.vote(2, wei("200"), true, { from: THIRD });
        await validators.vote(2, wei("100"), true, { from: SECOND });
        await validators.execute(2);

        assert.equal(await validatorsToken.balanceOf(SECOND), wei("0"));
      });

      it("should revert if proposal does not exist", async () => {
        await truffleAssert.reverts(validators.execute(1), "Validators: proposal does not exist");
      });

      it("should revert if only by `Succeeded` state", async () => {
        await validators.createInternalProposal(2, [wei("50"), toPercent("50")], [], { from: SECOND });
        await truffleAssert.reverts(validators.execute(1), "Validators: only by `Succeeded` state");
      });
    });

    describe("changeBalances()", () => {
      it("should set 100 tokens to SECOND", async () => {
        await validators.changeBalances([100], [SECOND]);

        assert.equal(await validatorsToken.balanceOf(SECOND), 100);
      });
    });
  });
});
