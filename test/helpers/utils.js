const BigNumber = require("bignumber.js");

const toBN = (value) => new BigNumber(value);

module.exports = {
  toBN,
};
