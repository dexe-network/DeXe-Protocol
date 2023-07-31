const { assert } = require("chai");
const BigNumber = require("bignumber.js");
const { toBN } = require("./utils");

const ZERO = toBN("0");
const ONE_17 = toBN("100000000000000000");
const ONE_18 = toBN("1000000000000000000");
const ONE_20 = toBN("100000000000000000000");
const ONE_36 = toBN("1000000000000000000000000000000000000");

const MAX_NATURAL_EXPONENT = ONE_18.times(130);
const MIN_NATURAL_EXPONENT = ONE_18.times(-41);

const LN_36_LOWER_BOUND = ONE_18.minus(ONE_17);
const LN_36_UPPER_BOUND = ONE_18.plus(ONE_17);

const MILD_EXPONENT_BOUND = toBN(2).exponentiatedBy(254).idiv(ONE_20);

const x0 = toBN("128000000000000000000"); // 2ˆ7
const a0 = toBN("38877084059945950922200000000000000000000000000000000000"); // eˆ(x0) (no decimals)
const x1 = toBN("64000000000000000000"); // 2ˆ6
const a1 = toBN("6235149080811616882910000000"); // eˆ(x1) (no decimals)

const x2 = toBN("3200000000000000000000"); // 2ˆ5
const a2 = toBN("7896296018268069516100000000000000"); // eˆ(x2)
const x3 = toBN("1600000000000000000000"); // 2ˆ4
const a3 = toBN("888611052050787263676000000"); // eˆ(x3)
const x4 = toBN("800000000000000000000"); // 2ˆ3
const a4 = toBN("298095798704172827474000"); // eˆ(x4)
const x5 = toBN("400000000000000000000"); // 2ˆ2
const a5 = toBN("5459815003314423907810"); // eˆ(x5)
const x6 = toBN("200000000000000000000"); // 2ˆ1
const a6 = toBN("738905609893065022723"); // eˆ(x6)
const x7 = toBN("100000000000000000000"); // 2ˆ0
const a7 = toBN("271828182845904523536"); // eˆ(x7)
const x8 = toBN("50000000000000000000"); // 2ˆ-1
const a8 = toBN("164872127070012814685"); // eˆ(x8)
const x9 = toBN("25000000000000000000"); // 2ˆ-2
const a9 = toBN("128402541668774148407"); // eˆ(x9)
const x10 = toBN("12500000000000000000"); // 2ˆ-3
const a10 = toBN("113314845306682631683"); // eˆ(x10)
const x11 = toBN("6250000000000000000"); // 2ˆ-4
const a11 = toBN("106449445891785942956"); // eˆ(x11)

function solidityPow(x, y) {
  x = toBN(x);
  y = toBN(y);
  assert.isTrue(!y.eq(0));
  if (x.eq(0)) {
    return ZERO;
  }

  let logx_times_y;
  if (LN_36_LOWER_BOUND.lt(x) && x.lt(LN_36_UPPER_BOUND)) {
    let ln_36_x = _ln_36(x);
    logx_times_y = ln_36_x.idiv(ONE_18).times(y).plus(ln_36_x.mod(ONE_18).times(y).idiv(ONE_18));
  } else {
    logx_times_y = _ln(x).times(y);
  }
  logx_times_y = logx_times_y.idiv(ONE_18);

  // require(
  //     MIN_NATURAL_EXPONENT <= logx_times_y && logx_times_y <= MAX_NATURAL_EXPONENT,
  //     "LogExpMath: Product out of bounds"
  // );

  return solidityExp(logx_times_y);
}

function solidityExp(x) {
  x = toBN(x);
  assert.isTrue(x.gte(MIN_NATURAL_EXPONENT) && x.lte(MAX_NATURAL_EXPONENT));
  if (x.lt(0)) {
    return ONE_18.times(ONE_18).idiv(solidityExp(ZERO.minus(x)));
  }

  let firstAN;
  if (x.gte(x0)) {
    x = x.minus(x0);
    firstAN = new BigNumber(a0);
  } else if (x.gte(x1)) {
    x = x.minus(x1);
    firstAN = new BigNumber(a1);
  } else {
    firstAN = toBN(1); // One with no decimal places
  }

  x = x.times(100);

  let product = new BigNumber(ONE_20);

  if (x.gte(x2)) {
    x = x.minus(x2);
    product = product.times(a2).idiv(ONE_20);
  }
  if (x.gte(x3)) {
    x = x.minus(x3);
    product = product.times(a3).idiv(ONE_20);
  }
  if (x.gte(x4)) {
    x = x.minus(x4);
    product = product.times(a4).idiv(ONE_20);
  }
  if (x.gte(x5)) {
    x = x.minus(x5);
    product = product.times(a5).idiv(ONE_20);
  }
  if (x.gte(x6)) {
    x = x.minus(x6);
    product = product.times(a6).idiv(ONE_20);
  }
  if (x.gte(x7)) {
    x = x.minus(x7);
    product = product.times(a7).idiv(ONE_20);
  }
  if (x.gte(x8)) {
    x = x.minus(x8);
    product = product.times(a8).idiv(ONE_20);
  }
  if (x.gte(x9)) {
    x = x.minus(x9);
    product = product.times(a9).idiv(ONE_20);
  }

  let seriesSum = new BigNumber(ONE_20); // The initial one in the sum, with 20 decimal places.
  let term; // Each term in the sum, where the nth term is (x^n / n!).

  term = new BigNumber(x);
  seriesSum = seriesSum.plus(term);

  term = term.times(x).idiv(ONE_20).idiv(2);
  seriesSum = seriesSum.plus(term);

  term = term.times(x).idiv(ONE_20).idiv(3);
  seriesSum = seriesSum.plus(term);

  term = term.times(x).idiv(ONE_20).idiv(4);
  seriesSum = seriesSum.plus(term);

  term = term.times(x).idiv(ONE_20).idiv(5);
  seriesSum = seriesSum.plus(term);

  term = term.times(x).idiv(ONE_20).idiv(6);
  seriesSum = seriesSum.plus(term);

  term = term.times(x).idiv(ONE_20).idiv(7);
  seriesSum = seriesSum.plus(term);

  term = term.times(x).idiv(ONE_20).idiv(8);
  seriesSum = seriesSum.plus(term);

  term = term.times(x).idiv(ONE_20).idiv(9);
  seriesSum = seriesSum.plus(term);

  term = term.times(x).idiv(ONE_20).idiv(10);
  seriesSum = seriesSum.plus(term);

  term = term.times(x).idiv(ONE_20).idiv(11);
  seriesSum = seriesSum.plus(term);

  term = term.times(x).idiv(ONE_20).idiv(12);
  seriesSum = seriesSum.plus(term);

  return product.times(seriesSum).idiv(ONE_20).times(firstAN).idiv(100);
}

function solidityLn(a) {
  a = toBN(a);
  assert.isTrue(a.gt(0));
  if (LN_36_LOWER_BOUND.lt(a) && a.lt(LN_36_UPPER_BOUND)) {
    return _ln_36(a).idiv(ONE_18);
  } else {
    return _ln(a);
  }
}

function _ln(a) {
  if (a.lt(ONE_18)) {
    return ZERO.minus(_ln(ONE_18.times(ONE_18).idiv(a)));
  }

  let sum = ZERO;
  if (a.gte(a0.times(ONE_18))) {
    a = a.idiv(a0); // Integer, not fixed point division
    sum = sum.plus(x0);
  }

  if (a.gte(a1.times(ONE_18))) {
    a = a.idiv(a1); // Integer, not fixed point division
    sum = sum.plus(x1);
  }

  sum = sum.times(100);
  a = a.times(100);

  if (a.gte(a2)) {
    a = a.times(ONE_20).idiv(a2);
    sum = sum.plus(x2);
  }

  if (a.gte(a3)) {
    a = a.times(ONE_20).idiv(a3);
    sum = sum.plus(x3);
  }

  if (a.gte(a4)) {
    a = a.times(ONE_20).idiv(a4);
    sum = sum.plus(x4);
  }

  if (a.gte(a5)) {
    a = a.times(ONE_20).idiv(a5);
    sum = sum.plus(x5);
  }

  if (a.gte(a6)) {
    a = a.times(ONE_20).idiv(a6);
    sum = sum.plus(x6);
  }

  if (a.gte(a7)) {
    a = a.times(ONE_20).idiv(a7);
    sum = sum.plus(x7);
  }

  if (a.gte(a8)) {
    a = a.times(ONE_20).idiv(a8);
    sum = sum.plus(x8);
  }

  if (a.gte(a9)) {
    a = a.times(ONE_20).idiv(a9);
    sum = sum.plus(x9);
  }

  if (a.gte(a10)) {
    a = a.times(ONE_20).idiv(a10);
    sum = sum.plus(x10);
  }

  if (a.gte(a11)) {
    a = a.times(ONE_20).idiv(a11);
    sum = sum.plus(x11);
  }

  let z = a.minus(ONE_20).times(ONE_20).idiv(a.plus(ONE_20));
  let z_squared = z.times(z).idiv(ONE_20);

  let num = new BigNumber(z);

  let seriesSum = new BigNumber(num);

  num = num.times(z_squared).idiv(ONE_20);
  seriesSum = seriesSum.plus(num.idiv(3));

  num = num.times(z_squared).idiv(ONE_20);
  seriesSum = seriesSum.plus(num.idiv(5));

  num = num.times(z_squared).idiv(ONE_20);
  seriesSum = seriesSum.plus(num.idiv(7));

  num = num.times(z_squared).idiv(ONE_20);
  seriesSum = seriesSum.plus(num.idiv(9));

  num = num.times(z_squared).idiv(ONE_20);
  seriesSum = seriesSum.plus(num.idiv(11));

  seriesSum = seriesSum.times(2);

  return sum.plus(seriesSum).idiv(100);
}

function _ln_36(x) {
  x = x.times(ONE_18);

  let z = x.minus(ONE_36).times(ONE_36).idiv(x.plus(ONE_36));
  let z_squared = z.times(z).idiv(ONE_36);

  let num = new BigNumber(z);

  let seriesSum = new BigNumber(num);

  num = num.times(z_squared).idiv(ONE_36);
  seriesSum = seriesSum.plus(num.idiv(3));

  num = num.times(z_squared).idiv(ONE_36);
  seriesSum = seriesSum.plus(num.idiv(5));

  num = num.times(z_squared).idiv(ONE_36);
  seriesSum = seriesSum.plus(num.idiv(7));

  num = num.times(z_squared).idiv(ONE_36);
  seriesSum = seriesSum.plus(num.idiv(9));

  num = num.times(z_squared).idiv(ONE_36);
  seriesSum = seriesSum.plus(num.idiv(11));

  num = num.times(z_squared).idiv(ONE_36);
  seriesSum = seriesSum.plus(num.idiv(13));

  num = num.times(z_squared).idiv(ONE_36);
  seriesSum = seriesSum.plus(num.idiv(15));

  return seriesSum.times(2);
}

module.exports = {
  solidityExp,
  solidityLn,
  solidityPow,
};
