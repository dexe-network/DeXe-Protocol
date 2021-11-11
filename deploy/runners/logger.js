function logTransaction(tx, name) {
  console.log(`Transaction ${name}: Gas used ${tx.receipt.gasUsed}, Hash ${tx.tx}\n`);
}

function logAddress(name, address) {
  console.log("CONTRACT: " + name + " ----- " + address + "\n");
}

module.exports = {
  logAddress,
  logTransaction,
};
