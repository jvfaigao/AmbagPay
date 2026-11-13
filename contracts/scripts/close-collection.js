// Closes a fee (collection) so members can claim their share of the leftover. Only the admin wallet in .env can do this.
// Closing cannot be undone: nobody can pay this fee afterwards. Never close the live demo fee (collection 0).
//
// Usage (PowerShell): $env:ID="1"; npx hardhat run scripts/close-collection.js --network bscTestnet
// Usage (bash):       ID=1 npx hardhat run scripts/close-collection.js --network bscTestnet
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== 97n && net.chainId !== 31337n) throw new Error("Refusing: not BSC Testnet (97) or a local chain.");
  if (!/^\d+$/.test(process.env.ID || "")) throw new Error("ID is required, e.g. ID=1");
  const id = BigInt(process.env.ID);

  const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  const { AmbagVault } = JSON.parse(fs.readFileSync(file, "utf8"));
  const vault = await ethers.getContractAt("AmbagVault", AmbagVault);

  const [admin] = await ethers.getSigners();
  if (!(await vault.hasRole(await vault.ADMIN_ROLE(), admin.address))) throw new Error(`${admin.address} has no ADMIN_ROLE on ${AmbagVault}`);

  await vault.closeCollection.staticCall(id); // dry run: NotOpen / PendingExpenses revert here with no gas spent
  await (await vault.closeCollection(id)).wait();

  const c = await vault.getCollection(id);
  const fmt = (wei) => `₱${Number(ethers.formatEther(wei)).toFixed(2)}`;
  console.log(`Closed collection ${id}: ${c.name}`);
  console.log(`  Leftover:   ${fmt(c.totalCollected - c.totalSpent)} across ${c.payerCount} payers`);
  console.log(`  Refund:     ${fmt(c.refundPerMember)} per member (claim on /pay/${id})`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
