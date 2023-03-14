const { assert } = require("chai");
const { toBN, accounts, wei } = require("../../scripts/utils/utils");
const { toPercent } = require("../utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { ZERO_ADDR, PRECISION } = require("../../scripts/utils/constants");
const { ValidatorsProposalState } = require("../utils/constants");
const { getCurrentBlockTime, setTime } = require("../helpers/block-helper");

const GovValidators = artifacts.require("GovValidators");
const GovValidatorsToken = artifacts.require("GovValidatorsToken");

GovValidators.numberFormat = "BigNumber";
GovValidatorsToken.numberFormat = "BigNumber";

describe("GovValidators", () => {
  let OWNER;
  let SECOND;
  let THIRD;

  let validators;
  let validatorsToken;

  const reverter = new Reverter();

  const getInternalProposalByIndex = async (index) => (await validators.getInternalProposals(index - 1, 1))[0];

  before("setup", async () => {
    OWNER = await accounts(0);
    SECOND = await accounts(1);
    THIRD = await accounts(2);

    validators = await GovValidators.new();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("invalid Validators", () => {
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

      it("should revert if gov address is zero", async () => {
        await truffleAssert.reverts(
          validators.__GovValidators_init(
            "Validator Token",
            "VT",
            100,
            PRECISION.times("51").toFixed(),
            [SECOND],
            [wei("100")]
          ),
          "Validators: zero gov address"
        );
      });
    });
  });

  describe("valid Validators", () => {
    beforeEach("setup", async () => {
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

      it("only owner should call these functions", async () => {
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

    describe("access", () => {
      it("should not initialize twice", async () => {
        await truffleAssert.reverts(
          validators.__GovValidators_init(
            "Validator Token",
            "VT",
            500,
            PRECISION.times("51").toFixed(),
            [SECOND, THIRD],
            [wei("100"), wei("200")]
          ),
          "Initializable: contract is already initialized"
        );
      });

      it("only owner should call these functions", async () => {
        await truffleAssert.reverts(
          validators.changeBalances([100], [SECOND], { from: SECOND }),
          "Ownable: caller is not the owner"
        );

        await truffleAssert.reverts(
          validators.executeExternalProposal(1, { from: SECOND }),
          "Ownable: caller is not the owner"
        );
      });

      it("only validator should call these functions", async () => {
        assert.isFalse(await validators.isValidator(OWNER));

        await truffleAssert.reverts(
          validators.createInternalProposal(1, "example.com", [100], [SECOND]),
          "Validators: caller is not the validator"
        );

        await validators.createInternalProposal(1, "example.com", [100], [SECOND], { from: SECOND });

        await truffleAssert.reverts(validators.vote(1, 1, true), "Validators: caller is not the validator");
      });
    });

    describe("createInternalProposal()", () => {
      it("should create internal proposals", async () => {
        let currentTime = await getCurrentBlockTime();

        await validators.createInternalProposal(0, "example.com", [13], [OWNER], { from: SECOND });

        const internal = (await getInternalProposalByIndex(1)).proposal;

        assert.equal(internal.proposalType, 0);
        assert.equal(internal.descriptionURL, "example.com");
        assert.equal(internal.core.voteEnd, currentTime + 500 + 1);
        assert.isFalse(internal.core.executed);
        assert.equal(internal.core.quorum, toPercent("51"));
        assert.equal(internal.core.votesFor, 0);
        assert.equal(internal.core.snapshotId, 1);

        assert.equal((await validators.getProposalRequiredQuorum(1, true)).toFixed(), wei("153"));
        assert.equal((await validators.getProposalRequiredQuorum(2, true)).toFixed(), "0");
      });

      it("should revert when arrays lengths not equals", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(3, "example.com", [13, 15], [OWNER], { from: SECOND }),
          "Validators: invalid length"
        );
      });

      it("should revert if invalid duration value", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(0, "example.com", [0], [], { from: SECOND }),
          "Validators: invalid duration value"
        );
      });

      it("should revert if invalid quorum value", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(1, "example.com", [toPercent(101)], [OWNER], { from: SECOND }),
          "Validators: invalid quorum value"
        );
      });

      it("should revert if invalid values", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(2, "example.com", [1, toPercent(101)], [], { from: SECOND }),
          "Validators: invalid duration or quorum values"
        );
      });

      it("should revert if invalid address", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(3, "example.com", [0], [ZERO_ADDR], { from: SECOND }),
          "Validators: invalid address"
        );
      });
    });

    describe("createExternalProposal()", () => {
      it("should correctly create external proposals", async () => {
        let currentTime = await getCurrentBlockTime();

        await validators.createExternalProposal(1, 33, 66);

        const external = await validators.getExternalProposal(1);

        assert.equal(external.core.voteEnd, currentTime + 33 + 1);
        assert.equal(external.core.executed, false);
        assert.equal(external.core.quorum, 66);
        assert.equal(external.core.votesFor, 0);
        assert.equal(external.core.snapshotId, 1);

        assert.equal(await validators.getProposalState(1, false), ValidatorsProposalState.Voting);

        assert.equal((await validators.getProposalRequiredQuorum(1, false)).toFixed(), "0");
        assert.equal((await validators.getProposalRequiredQuorum(2, false)).toFixed(), "0");
      });

      it("should revert if caller is not the owner", async () => {
        await truffleAssert.reverts(
          validators.createExternalProposal(1, 1, 1, { from: SECOND }),
          "Ownable: caller is not the owner"
        );
      });

      it("should revert if proposal already exists", async () => {
        await validators.createExternalProposal(1, 1, 1);
        await truffleAssert.reverts(validators.createExternalProposal(1, 1, 1), "Validators: proposal already exists");
      });
    });

    describe("vote()", () => {
      it("should vote with existed balance, internal proposals", async () => {
        await validators.createInternalProposal(0, "example.com", [100], [], { from: SECOND });

        await validators.vote(1, wei("40"), true, { from: SECOND });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("40"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("0"));
        assert.equal((await getInternalProposalByIndex(1)).proposal.core.votesFor, wei("40"));

        await validators.vote(1, wei("50"), true, { from: THIRD });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("40"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("50"));
        assert.equal((await getInternalProposalByIndex(1)).proposal.core.votesFor, wei("90"));

        await validators.vote(1, wei("60"), true, { from: SECOND });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("100"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("50"));
        assert.equal((await getInternalProposalByIndex(1)).proposal.core.votesFor, wei("150"));
      });

      it("should vote when amount more than balance, internal proposals", async () => {
        await validators.createInternalProposal(0, "example.com", [100], [], { from: SECOND });

        await validators.vote(1, wei("100"), true, { from: SECOND });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("100"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("0"));
        assert.equal((await getInternalProposalByIndex(1)).proposal.core.votesFor, wei("100"));

        await validators.vote(1, wei("200"), true, { from: THIRD });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("100"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("200"));
        assert.equal((await getInternalProposalByIndex(1)).proposal.core.votesFor, wei("300"));
      });

      it("should correctly vote by snapshot balance, internal proposals", async () => {
        await validators.createInternalProposal(0, "example.com", [100], [], { from: SECOND });
        await validators.createInternalProposal(3, "example.com", [wei("40"), wei("60")], [SECOND, THIRD], {
          from: SECOND,
        });

        await validators.vote(2, wei("200"), true, { from: THIRD });

        await validators.execute(2);

        assert.equal(await validatorsToken.balanceOf(SECOND), wei("40"));
        assert.equal(await validatorsToken.balanceOf(THIRD), wei("60"));

        await validators.vote(1, wei("100"), true, { from: SECOND });
        await validators.vote(1, wei("200"), true, { from: THIRD });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("100"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("200"));
        assert.equal((await getInternalProposalByIndex(1)).proposal.core.votesFor, wei("300"));

        await validators.createInternalProposal(0, "example.com", [10], [], { from: SECOND });

        await validators.vote(3, wei("40"), true, { from: SECOND });
        await validators.vote(3, wei("60"), true, { from: THIRD });

        assert.equal(await validators.addressVoted(3, true, SECOND), wei("40"));
        assert.equal(await validators.addressVoted(3, true, THIRD), wei("60"));
        assert.equal((await getInternalProposalByIndex(3)).proposal.core.votesFor, wei("100"));
      });

      it("should vote with existed balance, external proposals", async () => {
        await validators.createExternalProposal(2, 1000, toPercent("51"));

        await validators.vote(2, wei("40"), false, { from: SECOND });

        assert.equal(await validators.addressVoted(2, false, SECOND), wei("40"));
        assert.equal(await validators.addressVoted(2, false, THIRD), wei("0"));
        assert.equal((await validators.getExternalProposal(2)).core.votesFor, wei("40"));

        await validators.vote(2, wei("50"), false, { from: THIRD });

        assert.equal(await validators.addressVoted(2, false, SECOND), wei("40"));
        assert.equal(await validators.addressVoted(2, false, THIRD), wei("50"));
        assert.equal((await validators.getExternalProposal(2)).core.votesFor, wei("90"));

        await validators.vote(2, wei("60"), false, { from: SECOND });

        assert.equal(await validators.addressVoted(2, false, SECOND), wei("100"));
        assert.equal(await validators.addressVoted(2, false, THIRD), wei("50"));
        assert.equal((await validators.getExternalProposal(2)).core.votesFor, wei("150"));
      });

      it("should revert if proposal does not exist", async () => {
        await truffleAssert.reverts(
          validators.vote(1, 1, false, { from: SECOND }),
          "Validators: proposal does not exist"
        );
      });

      it("should revert if not Voting state", async () => {
        await validators.createInternalProposal(0, "example.com", [100], [], { from: SECOND });
        await validators.vote(1, wei("200"), true, { from: THIRD });

        await truffleAssert.reverts(validators.vote(1, 1, true, { from: SECOND }), "Validators: not Voting state");
      });

      it("should revert if vote amount can't be zero", async () => {
        await validators.createInternalProposal(0, "example.com", [100], [], { from: SECOND });
        await validators.vote(1, wei("100"), true, { from: SECOND });

        await truffleAssert.reverts(validators.vote(1, 1, true, { from: SECOND }), "Validators: excessive vote amount");
      });
    });

    describe("getExternalProposal()", () => {
      it("should return zero proposal if doesn't exist", async () => {
        const proposal = await validators.getExternalProposal(1);
        assert.equal(proposal.core.executed, false);
        assert.equal(proposal.core.voteEnd, 0);
        assert.equal(proposal.core.quorum, 0);
        assert.equal(proposal.core.votesFor, 0);
        assert.equal(proposal.core.snapshotId, 0);
      });
    });

    describe("getInternalProposals() latestInternalProposalId()", () => {
      const internalProposalToObject = (proposal) => {
        return {
          proposalType: proposal.proposal[0],
          descriptionURL: proposal.proposal[2],
          newValues: proposal.proposal[3],
          userAddresses: proposal.proposal[4],
        };
      };

      it("should not return proposals if no proposals", async () => {
        const proposals = (await validators.getInternalProposals(0, 1)).map(internalProposalToObject);
        assert.deepEqual(proposals, []);
      });

      it("should return zero latestInternalProposalId if no internal proposals", async () => {
        assert.equal(await validators.latestInternalProposalId(), 0);
      });

      describe("after adding internal proposals", async () => {
        let internalProposals;

        beforeEach("setup", async () => {
          internalProposals = [
            {
              proposalType: "0",
              descriptionURL: "example1.com",
              newValues: ["100"],
              userAddresses: [],
            },
            {
              proposalType: "1",
              descriptionURL: "example2.com",
              newValues: [toPercent("20")],
              userAddresses: [],
            },
            {
              proposalType: "2",
              descriptionURL: "example3.com",
              newValues: ["50", toPercent("15")],
              userAddresses: [],
            },
            {
              proposalType: "3",
              descriptionURL: "example4.com",
              newValues: [wei("200")],
              userAddresses: [SECOND],
            },
          ];

          for (const internalProposal of internalProposals) {
            const { proposalType, descriptionURL, newValues, userAddresses } = internalProposal;
            await validators.createInternalProposal(proposalType, descriptionURL, newValues, userAddresses, {
              from: SECOND,
            });
          }
        });

        it("should return latestInternalProposalId properly", async () => {
          assert.equal(await validators.latestInternalProposalId(), internalProposals.length);
        });

        it("should return whole range properly", async () => {
          const proposals = (await validators.getInternalProposals(0, 4)).map(internalProposalToObject);
          assert.deepEqual(proposals, internalProposals);
        });

        it("should return proposals properly from the middle of the range", async () => {
          const proposals = (await validators.getInternalProposals(1, 2)).map(internalProposalToObject);
          assert.deepEqual(proposals, internalProposals.slice(1, 3));
        });

        it("should return proposals properly if offset + limit > latestProposalId", async () => {
          const proposals = (await validators.getInternalProposals(2, 5)).map(internalProposalToObject);
          assert.deepEqual(proposals, internalProposals.slice(2));
        });

        it("should not return proposals if offset > latestProposalId", async () => {
          const proposals = (await validators.getInternalProposals(4, 1)).map(internalProposalToObject);
          assert.deepEqual(proposals, []);
        });
      });
    });

    describe("getProposalState()", () => {
      it("should correctly return `Voting` state and `Succeeded` state when quorum reached", async () => {
        await validators.createInternalProposal(0, "example.com", [100], [], { from: SECOND });

        await validators.vote(1, wei("100"), true, { from: SECOND });
        await validators.vote(1, wei("52"), true, { from: THIRD });

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Voting);

        await validators.vote(1, wei("1"), true, { from: THIRD });
        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Succeeded);
      });

      it("should correctly return `Defeated`", async () => {
        let currentTime = await getCurrentBlockTime();
        await validators.createInternalProposal(0, "example.com", [100], [], { from: SECOND });

        await validators.vote(1, wei("100"), true, { from: SECOND });
        await validators.vote(1, wei("52"), true, { from: THIRD });

        await setTime(currentTime + 501);
        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Voting);

        await setTime(currentTime + 502);
        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Defeated);
      });

      it("should correctly return `Executed` state", async () => {
        await validators.createInternalProposal(0, "example.com", [100], [], { from: SECOND });
        await validators.vote(1, wei("100"), true, { from: SECOND });
        await validators.vote(1, wei("53"), true, { from: THIRD });

        await validators.execute(1);

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Executed);
      });

      it("should correctly return `Undefined` state", async () => {
        assert.equal(await validators.getProposalState(2, true), ValidatorsProposalState.Undefined);
        assert.equal(await validators.getProposalState(2, false), ValidatorsProposalState.Undefined);
      });
    });

    describe("execute()", () => {
      it("should correctly execute `ChangeInternalDuration` proposal", async () => {
        await validators.createInternalProposal(0, "example.com", [1500], [], { from: SECOND });
        await validators.vote(1, wei("100"), true, { from: SECOND });
        await validators.vote(1, wei("200"), true, { from: THIRD });

        await validators.execute(1);

        assert.equal((await validators.internalProposalSettings()).duration, 1500);

        await validators.createInternalProposal(0, "example.com", [333], [], { from: THIRD });
        await validators.vote(2, wei("100"), true, { from: SECOND });
        await validators.vote(2, wei("200"), true, { from: THIRD });

        await validators.execute(2);

        assert.equal((await validators.internalProposalSettings()).duration, 333);
      });

      it("should correctly execute `ChangeInternalQuorum` proposal", async () => {
        await validators.createInternalProposal(1, "example.com", [toPercent("20")], [], { from: SECOND });
        await validators.vote(1, wei("100"), true, { from: SECOND });
        await validators.vote(1, wei("200"), true, { from: THIRD });

        await validators.execute(1);

        assert.equal((await validators.internalProposalSettings()).quorum.toFixed(), toPercent("20"));

        await validators.createInternalProposal(2, "example.com", [50, toPercent("15")], [], { from: THIRD });

        await validators.vote(2, wei("100"), true, { from: SECOND });

        await validators.execute(2);

        assert.equal((await validators.internalProposalSettings()).duration.toFixed(), "50");
        assert.equal((await validators.internalProposalSettings()).quorum.toFixed(), toPercent("15"));
      });

      it("should correctly execute `ChangeBalances` proposal", async () => {
        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Undefined);

        await validators.createInternalProposal(3, "example.com", [wei("200")], [SECOND], { from: SECOND });
        await validators.vote(1, wei("200"), true, { from: THIRD });

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Succeeded);

        await validators.execute(1);

        assert.equal((await validatorsToken.balanceOf(SECOND)).toFixed(), wei("200"));

        await validators.createInternalProposal(3, "example.com", [wei("0")], [SECOND], { from: SECOND });

        await validators.vote(2, wei("200"), true, { from: THIRD });
        await validators.vote(2, wei("100"), true, { from: SECOND });

        await validators.execute(2);

        assert.equal(await validatorsToken.balanceOf(SECOND), wei("0"));
      });

      it("should revert if proposal does not exist", async () => {
        await truffleAssert.reverts(validators.execute(1), "Validators: proposal does not exist");
      });

      it("should revert if not Succeeded state", async () => {
        await validators.createInternalProposal(2, "example.com", [wei("50"), toPercent("50")], [], { from: SECOND });
        await truffleAssert.reverts(validators.execute(1), "Validators: not Succeeded state");
      });
    });

    describe("changeBalances()", () => {
      it("should change SECOND balance", async () => {
        await validators.changeBalances([100], [SECOND]);

        assert.equal(await validatorsToken.balanceOf(SECOND), 100);

        await validators.changeBalances([10], [SECOND]);

        assert.equal(await validatorsToken.balanceOf(SECOND), 10);

        await validators.changeBalances([10], [SECOND]);

        assert.equal(await validatorsToken.balanceOf(SECOND), 10);
      });
    });
  });
});
