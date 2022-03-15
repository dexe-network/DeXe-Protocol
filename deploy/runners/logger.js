function logTransaction(tx, name) {
  console.log(`Transaction ${name}: Gas used ${tx.receipt.gasUsed}, Hash ${tx.tx}\n`);
}

module.exports = {
  logAddress,
  logTransaction,
};
