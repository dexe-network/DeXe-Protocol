const { assert } = require("chai");
const { toBN, accounts, wei } = require("../../scripts/utils/utils");
const { toPercent } = require("../utils/utils");
const Reverter = require("../helpers/reverter");
const truffleAssert = require("truffle-assertions");
const { ZERO_ADDR, PRECISION } = require("../../scripts/utils/constants");
const { ValidatorsProposalState, ProposalType, ProposalState } = require("../utils/constants");
const { getCurrentBlockTime, setTime } = require("../helpers/block-helper");
const {
  getBytesChangeInternalBalances,
  getBytesChangeValidatorSettings,
  getBytesMonthlyWithdraw,
} = require("../utils/gov-validators-utils");

const GovValidators = artifacts.require("GovValidators");
const GovValidatorsToken = artifacts.require("GovValidatorsToken");
const ERC20Mock = artifacts.require("ERC20Mock");

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

  async function createInternalProposal(proposalType, description, amounts, users, from) {
    let data;
    switch (proposalType) {
      case ProposalType.ChangeSettings:
        data = getBytesChangeValidatorSettings(amounts);
        break;
      case ProposalType.ChangeBalances:
        data = getBytesChangeInternalBalances(amounts, users);
        break;
      case ProposalType.MonthlyWithdraw:
        data = getBytesMonthlyWithdraw(users.slice(0, users.length - 1), amounts, users[users.length - 1]);
        break;
      case ProposalType.OffchainProposal:
        data = "0x";
        break;
      default:
        assert.isTrue(false);
    }
    await validators.createInternalProposal(proposalType, description, data, { from: from });
  }

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
            [500, 0, PRECISION.times("51").toFixed()],
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
            [0, 0, PRECISION.times("51").toFixed()],
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
            [100, 0, PRECISION.times("101").toFixed()],
            [SECOND],
            [wei("100")]
          ),
          "Validators: invalid quorum value"
        );
      });

      it("should revert if invalid quorum value", async () => {
        await truffleAssert.reverts(
          validators.__GovValidators_init(
            "Validator Token",
            "VT",
            [100, 0, PRECISION.times("0").toFixed()],
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
      await validators.__GovValidators_init(
        "Validator Token",
        "VT",
        [500, 0, PRECISION.times("51").toFixed()],
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
            [500, 0, toPercent(51)],
            [SECOND, THIRD],
            [wei("100"), wei("200")]
          ),
          "Initializable: contract is already initialized"
        );
      });

      it("only owner should call these functions", async () => {
        await truffleAssert.reverts(
          validators.executeExternalProposal(1, { from: SECOND }),
          "Ownable: caller is not the owner"
        );
      });

      it("only validators contract should call these functions", async () => {
        await truffleAssert.reverts(
          validators.changeSettings(50, 100, toPercent("50"), { from: SECOND }),
          "Validators: not this contract"
        );

        await truffleAssert.reverts(
          validators.changeBalances([100], [SECOND], { from: SECOND }),
          "Validators: not this nor GovPool contract"
        );

        await truffleAssert.reverts(
          validators.monthlyWithdraw([SECOND], [100], THIRD, { from: SECOND }),
          "Validators: not this contract"
        );
      });

      it("only validator should call these functions", async () => {
        assert.isFalse(await validators.isValidator(OWNER));

        await truffleAssert.reverts(
          createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [SECOND]),
          "Validators: caller is not the validator"
        );

        await createInternalProposal(
          ProposalType.ChangeSettings,
          "example.com",
          [100, 0, toPercent(51)],
          [SECOND],
          SECOND
        );

        await truffleAssert.reverts(validators.vote(1, 1, true, true), "Validators: caller is not the validator");
      });
    });

    describe("createInternalProposal()", () => {
      it("should create internal proposals", async () => {
        let currentTime = await getCurrentBlockTime();

        await createInternalProposal(
          ProposalType.ChangeSettings,
          "example.com",
          [13, 0, toPercent(51)],
          [OWNER],
          SECOND
        );

        const internal = (await getInternalProposalByIndex(1)).proposal;

        assert.equal(internal.proposalType, 0);
        assert.equal(internal.descriptionURL, "example.com");
        assert.equal(internal.core.voteEnd, currentTime + 500 + 1);
        assert.equal(internal.core.executeAfter, 0);
        assert.isFalse(internal.core.executed);
        assert.equal(internal.core.quorum, toPercent("51"));
        assert.equal(internal.core.votesFor, 0);
        assert.equal(internal.core.snapshotId, 1);

        assert.equal((await validators.getProposalRequiredQuorum(1, true)).toFixed(), wei("153"));
        assert.equal((await validators.getProposalRequiredQuorum(2, true)).toFixed(), "0");
      });

      it("should revert when arrays lengths not equals", async () => {
        await truffleAssert.reverts(
          createInternalProposal(ProposalType.ChangeBalances, "example.com", [13, 15], [OWNER], SECOND),
          "Validators: invalid array length"
        );

        await truffleAssert.reverts(
          createInternalProposal(ProposalType.MonthlyWithdraw, "example.com", [13, 15], [OWNER], SECOND),
          "Validators: invalid array length"
        );
      });

      it("should revert if invalid duration value", async () => {
        await truffleAssert.reverts(
          createInternalProposal(ProposalType.ChangeSettings, "example.com", [0, 0, toPercent(51)], [], SECOND),
          "Validators: duration is zero"
        );
      });

      it("should revert if invalid quorum value", async () => {
        await truffleAssert.reverts(
          createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(101)], [OWNER], SECOND),
          "Validators: invalid quorum value"
        );
      });

      it("should revert if invalid values", async () => {
        await truffleAssert.reverts(
          createInternalProposal(ProposalType.ChangeSettings, "example.com", [1, 1, toPercent(101)], [], SECOND),
          "Validators: invalid quorum value"
        );
      });

      it("should revert if invalid address", async () => {
        await truffleAssert.reverts(
          createInternalProposal(ProposalType.ChangeBalances, "example.com", [0], [ZERO_ADDR], SECOND),
          "Validators: invalid address"
        );

        await truffleAssert.reverts(
          createInternalProposal(ProposalType.MonthlyWithdraw, "example.com", [0], [ZERO_ADDR, SECOND], SECOND),
          "Validators: address of token cannot be zero"
        );

        await truffleAssert.reverts(
          createInternalProposal(ProposalType.MonthlyWithdraw, "example.com", [0], [SECOND, ZERO_ADDR], SECOND),
          "Validators: destination address cannot be zero"
        );
      });

      it("should revert if nonzero data in offchain proposal", async () => {
        await truffleAssert.reverts(
          validators.createInternalProposal(ProposalType.OffchainProposal, "example.com", "0xff", { from: SECOND }),
          "Validators: offchain proposal should not have data"
        );
      });

      describe("should revert if wrong selector", () => {
        it("changeSettings()", async () => {
          await truffleAssert.reverts(
            validators.createInternalProposal(
              ProposalType.ChangeSettings,
              "example.com",
              getBytesChangeInternalBalances([wei(1)], [SECOND]),
              { from: SECOND }
            ),
            "Validators: not ChangeSettings function"
          );
        });

        it("changeBalances()", async () => {
          await truffleAssert.reverts(
            validators.createInternalProposal(
              ProposalType.ChangeBalances,
              "example.com",
              getBytesChangeValidatorSettings([1, 1, toPercent(51)]),
              { from: SECOND }
            ),
            "Validators: not ChangeBalances function"
          );
        });

        it("monthlyWithdraw()", async () => {
          await truffleAssert.reverts(
            validators.createInternalProposal(
              ProposalType.MonthlyWithdraw,
              "example.com",
              getBytesChangeInternalBalances([wei(1)], [SECOND]),
              { from: SECOND }
            ),
            "Validators: not MonthlyWithdraw function"
          );
        });
      });
    });

    describe("createExternalProposal()", () => {
      it("should correctly create external proposals", async () => {
        let currentTime = await getCurrentBlockTime();

        await validators.createExternalProposal(1, [33, 0, 66]);

        const external = await validators.getExternalProposal(1);

        assert.equal(external.core.voteEnd, currentTime + 33 + 1);
        assert.equal(external.core.executeAfter, 0);
        assert.equal(external.core.executed, false);
        assert.equal(external.core.quorum, 66);
        assert.equal(external.core.votesFor, 0);
        assert.equal(external.core.votesAgainst, 0);
        assert.equal(external.core.snapshotId, 1);

        assert.equal(await validators.getProposalState(1, false), ValidatorsProposalState.Voting);

        assert.equal((await validators.getProposalRequiredQuorum(1, false)).toFixed(), "0");
        assert.equal((await validators.getProposalRequiredQuorum(2, false)).toFixed(), "0");
      });

      it("should revert if caller is not the owner", async () => {
        await truffleAssert.reverts(
          validators.createExternalProposal(1, [1, 100, 1], { from: SECOND }),
          "Ownable: caller is not the owner"
        );
      });

      it("should revert if proposal already exists", async () => {
        await validators.createExternalProposal(1, [1, 100, 1]);
        await truffleAssert.reverts(
          validators.createExternalProposal(1, [1, 100, 1]),
          "Validators: proposal already exists"
        );
      });

      it("should revert if invalid duration value", async () => {
        await truffleAssert.reverts(validators.createExternalProposal(1, [0, 100, 1]), "Validators: duration is zero");
      });

      it("should revert if invalid quorum value", async () => {
        await truffleAssert.reverts(
          validators.createExternalProposal(1, [1, 100, toPercent(101)]),
          "Validators: invalid quorum value"
        );
      });
    });

    describe("vote()", () => {
      it("should vote with existed balance, internal proposals", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [], SECOND);

        await validators.vote(1, wei("40"), true, true, { from: SECOND });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("40"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("0"));

        let core = (await getInternalProposalByIndex(1)).proposal.core;
        assert.equal(core.votesFor, wei("40"));
        assert.equal(core.votesAgainst, "0");

        await validators.vote(1, wei("50"), true, true, { from: THIRD });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("40"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("50"));

        core = (await getInternalProposalByIndex(1)).proposal.core;

        assert.equal(core.votesFor, wei("90"));
        assert.equal(core.votesAgainst, "0");

        await validators.vote(1, wei("60"), true, false, { from: SECOND });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("100"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("50"));

        core = (await getInternalProposalByIndex(1)).proposal.core;

        assert.equal(core.votesFor, wei("90"));
        assert.equal(core.votesAgainst, wei("60"));
      });

      it("should vote when amount more than balance, internal proposals", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [], SECOND);

        await validators.vote(1, wei("100"), true, true, { from: SECOND });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("100"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("0"));

        let core = (await getInternalProposalByIndex(1)).proposal.core;

        assert.equal(core.votesFor, wei("100"));
        assert.equal(core.votesAgainst, "0");

        await validators.vote(1, wei("200"), true, false, { from: THIRD });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("100"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("200"));

        core = (await getInternalProposalByIndex(1)).proposal.core;

        assert.equal(core.votesFor, wei("100"));
        assert.equal(core.votesAgainst, wei("200"));
      });

      it("should correctly vote by snapshot balance, internal proposals", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [], SECOND);
        await createInternalProposal(
          ProposalType.ChangeBalances,
          "example.com",
          [wei("40"), wei("60")],
          [SECOND, THIRD],
          SECOND
        );

        await validators.vote(2, wei("200"), true, true, { from: THIRD });

        await validators.execute(2);

        assert.equal(await validatorsToken.balanceOf(SECOND), wei("40"));
        assert.equal(await validatorsToken.balanceOf(THIRD), wei("60"));

        await validators.vote(1, wei("100"), true, true, { from: SECOND });
        await validators.vote(1, wei("200"), true, false, { from: THIRD });

        assert.equal(await validators.addressVoted(1, true, SECOND), wei("100"));
        assert.equal(await validators.addressVoted(1, true, THIRD), wei("200"));

        let core = (await getInternalProposalByIndex(1)).proposal.core;

        assert.equal(core.votesFor, wei("100"));
        assert.equal(core.votesAgainst, wei("200"));

        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [10, 0, toPercent(51)], [], SECOND);

        await validators.vote(3, wei("40"), true, false, { from: SECOND });
        await validators.vote(3, wei("60"), true, true, { from: THIRD });

        assert.equal(await validators.addressVoted(3, true, SECOND), wei("40"));
        assert.equal(await validators.addressVoted(3, true, THIRD), wei("60"));

        core = (await getInternalProposalByIndex(3)).proposal.core;

        assert.equal(core.votesFor, wei("60"));
        assert.equal(core.votesAgainst, wei("40"));
      });

      it("should vote with existed balance, external proposals", async () => {
        await validators.createExternalProposal(2, [1000, 100, toPercent("51")]);

        await validators.vote(2, wei("40"), false, true, { from: SECOND });

        assert.equal(await validators.addressVoted(2, false, SECOND), wei("40"));
        assert.equal(await validators.addressVoted(2, false, THIRD), wei("0"));

        let core = (await validators.getExternalProposal(2)).core;

        assert.equal(core.votesFor, wei("40"));
        assert.equal(core.votesAgainst, "0");

        await validators.vote(2, wei("50"), false, false, { from: THIRD });

        assert.equal(await validators.addressVoted(2, false, SECOND), wei("40"));
        assert.equal(await validators.addressVoted(2, false, THIRD), wei("50"));

        core = (await validators.getExternalProposal(2)).core;

        assert.equal(core.votesFor, wei("40"));
        assert.equal(core.votesAgainst, wei("50"));

        await validators.vote(2, wei("60"), false, true, { from: SECOND });

        assert.equal(await validators.addressVoted(2, false, SECOND), wei("100"));
        assert.equal(await validators.addressVoted(2, false, THIRD), wei("50"));

        core = (await validators.getExternalProposal(2)).core;

        assert.equal(core.votesFor, wei("100"));
        assert.equal(core.votesAgainst, wei("50"));
      });

      it("should change executeAfter after quorum has reached for internal proposal", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [], SECOND);

        await validators.vote(1, wei("100"), true, true, { from: SECOND });
        await validators.vote(1, wei("52"), true, true, { from: THIRD });

        assert.equal((await getInternalProposalByIndex(1)).proposal.core.executeAfter, 0);

        await validators.vote(1, wei("1"), true, true, { from: THIRD });

        assert.equal((await getInternalProposalByIndex(1)).proposal.core.executeAfter, await getCurrentBlockTime());
      });

      it("should change executeAfter after quorum has reached for internal proposal with different executeDelay", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [500, 100, toPercent(51)], [], SECOND);

        await validators.vote(1, wei("100"), true, true, { from: SECOND });
        await validators.vote(1, wei("53"), true, true, { from: THIRD });

        await validators.execute(1);

        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 100, toPercent(51)], [], SECOND);

        await validators.vote(2, wei("100"), true, true, { from: SECOND });
        await validators.vote(2, wei("52"), true, true, { from: THIRD });

        assert.equal((await getInternalProposalByIndex(2)).proposal.core.executeAfter, 100);

        await validators.vote(2, wei("1"), true, true, { from: THIRD });

        assert.equal(
          (await getInternalProposalByIndex(2)).proposal.core.executeAfter,
          100 + (await getCurrentBlockTime())
        );
      });

      it("should change executeAfter after quorum has reached for external proposal", async () => {
        await validators.createExternalProposal(2, [100, 100, toPercent("51")]);

        await validators.vote(2, wei("100"), false, true, { from: SECOND });
        await validators.vote(2, wei("52"), false, true, { from: THIRD });

        assert.equal((await validators.getExternalProposal(2)).core.executeAfter, 100);

        await validators.vote(2, wei("1"), false, true, { from: THIRD });

        assert.equal((await validators.getExternalProposal(2)).core.executeAfter, 100 + (await getCurrentBlockTime()));
      });

      it("should revert if proposal does not exist", async () => {
        await truffleAssert.reverts(
          validators.vote(1, 1, false, true, { from: SECOND }),
          "Validators: proposal does not exist"
        );
      });

      it("should revert if not Voting state", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [], SECOND);
        await validators.vote(1, wei("200"), true, true, { from: THIRD });

        await truffleAssert.reverts(
          validators.vote(1, 1, true, true, { from: SECOND }),
          "Validators: not Voting state"
        );
      });

      it("should revert if vote amount can't be zero", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [], SECOND);
        await validators.vote(1, wei("100"), true, true, { from: SECOND });

        await truffleAssert.reverts(
          validators.vote(1, 1, true, true, { from: SECOND }),
          "Validators: excessive vote amount"
        );
      });
    });

    describe("getExternalProposal()", () => {
      it("should return zero proposal if doesn't exist", async () => {
        const proposal = await validators.getExternalProposal(1);
        assert.equal(proposal.core.executed, false);
        assert.equal(proposal.core.voteEnd, 0);
        assert.equal(proposal.core.executeAfter, 0);
        assert.equal(proposal.core.quorum, 0);
        assert.equal(proposal.core.votesFor, 0);
        assert.equal(proposal.core.votesAgainst, 0);
        assert.equal(proposal.core.snapshotId, 0);
      });
    });

    describe("getInternalProposals() latestInternalProposalId()", () => {
      const internalProposalToObject = (proposal) => {
        return {
          proposalType: proposal.proposal[0],
          descriptionURL: proposal.proposal[2],
          data: proposal.proposal[3],
        };
      };

      const internalProposalAddData = (proposal) => {
        let data;
        switch (parseInt(proposal.proposalType)) {
          case ProposalType.ChangeSettings:
            data = getBytesChangeValidatorSettings(proposal.newValues);
            break;
          case ProposalType.ChangeBalances:
            data = getBytesChangeInternalBalances(proposal.newValues, proposal.userAddresses);
            break;
          case ProposalType.MonthlyWithdraw:
            let l = proposal.userAddresses.length;
            data = getBytesMonthlyWithdraw(
              proposal.userAddresses.slice(0, l - 1),
              proposal.newValues,
              proposal.userAddresses[l - 1]
            );
            break;
          case ProposalType.OffchainProposal:
            data = "0x";
            break;
          default:
            assert.isTrue(false);
        }

        return {
          proposalType: proposal.proposalType,
          descriptionURL: proposal.descriptionURL,
          data: data,
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
              proposalType: ProposalType.ChangeSettings.toString(),
              descriptionURL: "example1.com",
              newValues: ["100", "0", toPercent("51")],
              userAddresses: [],
            },
            {
              proposalType: ProposalType.ChangeSettings.toString(),
              descriptionURL: "example2.com",
              newValues: ["500", "100", toPercent("51")],
              userAddresses: [],
            },
            {
              proposalType: ProposalType.ChangeSettings.toString(),
              descriptionURL: "example3.com",
              newValues: ["500", "0", toPercent("20")],
              userAddresses: [],
            },
            {
              proposalType: ProposalType.ChangeSettings.toString(),
              descriptionURL: "example4.com",
              newValues: ["50", "100", toPercent("15")],
              userAddresses: [],
            },
            {
              proposalType: ProposalType.ChangeBalances.toString(),
              descriptionURL: "example5.com",
              newValues: [wei("200")],
              userAddresses: [SECOND],
            },
            {
              proposalType: ProposalType.MonthlyWithdraw.toString(),
              descriptionURL: "example6.com",
              newValues: [wei("200")],
              userAddresses: [SECOND, THIRD],
            },
            {
              proposalType: ProposalType.OffchainProposal.toString(),
              descriptionURL: "example7.com",
              newValues: [],
              userAddresses: [],
            },
          ];

          for (const internalProposal of internalProposals) {
            const { proposalType, descriptionURL, newValues, userAddresses } = internalProposal;
            await createInternalProposal(parseInt(proposalType), descriptionURL, newValues, userAddresses, SECOND);
          }
        });

        it("should return latestInternalProposalId properly", async () => {
          assert.equal(await validators.latestInternalProposalId(), internalProposals.length);
        });

        it("should return whole range properly", async () => {
          const proposals = (await validators.getInternalProposals(0, 7)).map(internalProposalToObject);
          const internalProposalsWithData = internalProposals.map(internalProposalAddData);
          assert.deepEqual(proposals, internalProposalsWithData);
        });

        it("should return proposals properly from the middle of the range", async () => {
          const proposals = (await validators.getInternalProposals(1, 2)).map(internalProposalToObject);
          const internalProposalsWithData = internalProposals.map(internalProposalAddData);
          assert.deepEqual(proposals, internalProposalsWithData.slice(1, 3));
        });

        it("should return proposals properly if offset + limit > latestProposalId", async () => {
          const proposals = (await validators.getInternalProposals(2, 7)).map(internalProposalToObject);
          const internalProposalsWithData = internalProposals.map(internalProposalAddData);
          assert.deepEqual(proposals, internalProposalsWithData.slice(2));
        });

        it("should not return proposals if offset > latestProposalId", async () => {
          const proposals = (await validators.getInternalProposals(7, 1)).map(internalProposalToObject);
          assert.deepEqual(proposals, []);
        });
      });
    });

    describe("getProposalState()", () => {
      it("should correctly return `Voting` state and `Succeeded` state when quorum reached", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [], SECOND);

        await validators.vote(1, wei("100"), true, true, { from: SECOND });
        await validators.vote(1, wei("52"), true, true, { from: THIRD });

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Voting);

        await validators.vote(1, wei("1"), true, true, { from: THIRD });

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Locked);

        await setTime((await getCurrentBlockTime()) + 1);

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Succeeded);
      });

      it("should correctly return `Succeeded` state when quorum reached and an amount of votes for more than against", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [], SECOND);

        await validators.vote(1, wei("100"), true, true, { from: SECOND });
        await validators.vote(1, wei("52"), true, false, { from: THIRD });

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Voting);

        await validators.vote(1, wei("1"), true, false, { from: THIRD });

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Locked);

        await setTime((await getCurrentBlockTime()) + 1);

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Succeeded);
      });

      it("should correctly return `Defeated`", async () => {
        let currentTime = await getCurrentBlockTime();
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [], SECOND);

        await validators.vote(1, wei("100"), true, true, { from: SECOND });
        await validators.vote(1, wei("52"), true, true, { from: THIRD });

        await setTime(currentTime + 501);
        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Voting);

        await setTime(currentTime + 502);
        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Defeated);
      });

      it("should correctly return `Defeated` when an amount of votes for less than against", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [], SECOND);

        await validators.vote(1, wei("100"), true, false, { from: SECOND });
        await validators.vote(1, wei("53"), true, true, { from: THIRD });

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Defeated);
      });

      it("should correctly return `Executed` state", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [100, 0, toPercent(51)], [], SECOND);
        await validators.vote(1, wei("100"), true, true, { from: SECOND });
        await validators.vote(1, wei("53"), true, true, { from: THIRD });

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
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [1500, 0, toPercent(51)], [], SECOND);
        await validators.vote(1, wei("100"), true, true, { from: SECOND });
        await validators.vote(1, wei("200"), true, true, { from: THIRD });

        await validators.execute(1);

        assert.equal((await validators.internalProposalSettings()).duration, 1500);

        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [333, 0, toPercent(51)], [], THIRD);
        await validators.vote(2, wei("100"), true, true, { from: SECOND });
        await validators.vote(2, wei("200"), true, true, { from: THIRD });

        await validators.execute(2);

        assert.equal((await validators.internalProposalSettings()).duration, 333);
      });

      it("should correctly execute `ChangeInternalExecutionDelay` proposal", async () => {
        await createInternalProposal(
          ProposalType.ChangeSettings,
          "example.com",
          [500, 1500, toPercent(51)],
          [],
          SECOND
        );
        await validators.vote(1, wei("100"), true, true, { from: SECOND });
        await validators.vote(1, wei("200"), true, true, { from: THIRD });

        await validators.execute(1);

        assert.equal((await validators.internalProposalSettings()).executionDelay, 1500);

        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [500, 333, toPercent(51)], [], THIRD);
        await validators.vote(2, wei("100"), true, true, { from: SECOND });
        await validators.vote(2, wei("200"), true, true, { from: THIRD });

        assert.equal(await validators.getProposalState(2, true), ValidatorsProposalState.Locked);

        await setTime((await getCurrentBlockTime()) + 1499);

        assert.equal(await validators.getProposalState(2, true), ValidatorsProposalState.Locked);

        await setTime((await getCurrentBlockTime()) + 2);

        assert.equal(await validators.getProposalState(2, true), ValidatorsProposalState.Succeeded);

        await validators.execute(2);

        assert.equal((await validators.internalProposalSettings()).executionDelay, 333);
      });

      it("should correctly execute `ChangeInternalQuorum` proposal", async () => {
        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [500, 0, toPercent(20)], [], SECOND);
        await validators.vote(1, wei("100"), true, true, { from: SECOND });
        await validators.vote(1, wei("200"), true, true, { from: THIRD });

        await validators.execute(1);

        assert.equal((await validators.internalProposalSettings()).quorum.toFixed(), toPercent("20"));

        await createInternalProposal(ProposalType.ChangeSettings, "example.com", [50, 100, toPercent("15")], [], THIRD);

        await validators.vote(2, wei("100"), true, true, { from: SECOND });

        await validators.execute(2);

        assert.equal((await validators.internalProposalSettings()).duration.toFixed(), "50");
        assert.equal((await validators.internalProposalSettings()).quorum.toFixed(), toPercent("15"));
      });

      it("should correctly execute `ChangeBalances` proposal", async () => {
        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Undefined);

        await createInternalProposal(ProposalType.ChangeBalances, "example.com", [wei("200")], [SECOND], SECOND);

        await validators.vote(1, wei("200"), true, true, { from: THIRD });

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Locked);

        await setTime((await getCurrentBlockTime()) + 1);

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Succeeded);

        await validators.execute(1);

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Executed);

        assert.equal((await validatorsToken.balanceOf(SECOND)).toFixed(), wei("200"));

        await createInternalProposal(ProposalType.ChangeBalances, "example.com", [wei("0")], [SECOND], SECOND);

        await validators.vote(2, wei("200"), true, true, { from: THIRD });
        await validators.vote(2, wei("100"), true, true, { from: SECOND });

        await validators.execute(2);

        assert.equal(await validatorsToken.balanceOf(SECOND), wei("0"));
      });

      it("should correctly execute `OffchainProposal` proposal", async () => {
        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Undefined);

        await createInternalProposal(ProposalType.OffchainProposal, "example.com", [], [], SECOND);

        await validators.vote(1, wei("200"), true, true, { from: THIRD });

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Locked);

        await setTime((await getCurrentBlockTime()) + 1);

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Succeeded);

        await validators.execute(1);

        assert.equal(await validators.getProposalState(1, true), ValidatorsProposalState.Executed);
      });

      it("should revert if proposal does not exist", async () => {
        await truffleAssert.reverts(validators.execute(1), "Validators: proposal does not exist");
      });

      it("should revert if not Succeeded state", async () => {
        await createInternalProposal(
          ProposalType.ChangeSettings,
          "example.com",
          [50, 100, toPercent("50")],
          [],
          SECOND
        );
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
