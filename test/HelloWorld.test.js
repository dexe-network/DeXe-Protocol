const { assert } = require("chai");
const { toBN } = require("./helpers/utils");
const { getCurrentBlockTime, setNextBlockTime } = require("./helpers/hardhatTimeTraveller");

const HelloWorld = artifacts.require("HelloWorld");
HelloWorld.numberFormat = "BigNumber";

describe("HelloWorld", async () => {
  describe("greetings", async () => {
    let greeter;

    beforeEach("setup", async () => {
      greeter = await HelloWorld.new(toBN("123456789").toFixed());
    });

    it("should return the new greeting once it's changed", async function () {
      assert.equal((await greeter.greet()).toFixed(), toBN("123456789").toFixed());

      await greeter.setGreeting(toBN("987654321").toFixed());

      assert.equal((await greeter.greet()).toFixed(), toBN("987654321").toFixed());
    });

    it("time game", async () => {
      const timestamp = await getCurrentBlockTime();
      await setNextBlockTime(timestamp + 10);

      assert.equal(await getCurrentBlockTime(), timestamp);

      await greeter.setGreeting(toBN("987654321").toFixed());

      assert.equal(await getCurrentBlockTime(), timestamp + 10);
    });
  });
});
