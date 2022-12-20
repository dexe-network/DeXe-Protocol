const { PRECISION } = require("../../scripts/utils/constants");

const toPercent = (value) => {
  return PRECISION.times(value).toFixed();
};

const toBNPercent = (value) => {
  return PRECISION.times(value);
};

module.exports = {
  toPercent,
  toBNPercent,
};
