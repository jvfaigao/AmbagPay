// Creates a new fee (collection) on the deployed vault. Only the admin (president) wallet in .env can do this.
//
// Usage (PowerShell):
//   $env:NAME="Org Shirt"; $env:AMOUNT="250"; $env:CATEGORIES="Shirts:5000,Printing:500"; $env:DEADLINE="2026-12-15"
//   npx hardhat run scripts/create-collection.js --network bscTestnet
// Usage (bash):
//   NAME="Org Shirt" AMOUNT=250 CATEGORIES="Shirts:5000,Printing:500" DEADLINE=2026-12-15 npx hardhat run scripts/create-collection.js --network bscTestnet
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

function parseInput(env) {
  const name = (env.NAME || "").trim();
  const amount = Number(env.AMOUNT);
  const categories = (env.CATEGORIES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [label, cap] = pair.split(":").map((s) => (s || "").trim());
      return { label, cap: Number(cap) };
    });
  const deadline = env.DEADLINE ? Math.floor(new Date(`${env.DEADLINE}T23:59:59+08:00`).getTime() / 1000) : 0;

  if (!name) throw new Error("NAME is required, e.g. NAME=\"Org Shirt\"");
  if (!(amount > 0)) throw new Error("AMOUNT must be a peso amount above 0, e.g. AMOUNT=250");
  if (categories.length === 0 || categories.length > 20) throw new Error("CATEGORIES needs 1-20 items, e.g. CATEGORIES=\"Shirts:5000,Printing:500\"");
  for (const c of categories) if (!c.label || !(c.cap > 0)) throw new Error(`Bad category "${c.label}:${c.cap}" (use Name:cap)`);
  if (Number.isNaN(deadline)) throw new Error("DEADLINE must be YYYY-MM-DD");
  return { name, amount, categories, deadline };
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== 97n && net.chainId !== 31337n) throw new Error("Refusing: not BSC Testnet (97) or a local chain.");

  const { name, amount, categories, deadline } = parseInput(process.env);
  const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  const { AmbagVault } = JSON.parse(fs.readFileSync(file, "utf8"));
  const vault = await ethers.getContractAt("AmbagVault", AmbagVault);

  const [admin] = await ethers.getSigners();
  if (!(await vault.hasRole(await vault.ADMIN_ROLE(), admin.address))) throw new Error(`${admin.address} has no ADMIN_ROLE on ${AmbagVault}`);

  const P = (n) => ethers.parseEther(String(n));
  const args = [name, P(amount), deadline, categories.map((c) => c.label), categories.map((c) => P(c.cap))];
  const id = await vault.createCollection.staticCall(...args); // dry run first: reverts here with no gas spent
  await (await vault.createCollection(...args)).wait();

  console.log(`Created collection ${id}: ${name} (₱${amount})`);
  console.log(`  Categories: ${categories.map((c) => `${c.label} ₱${c.cap}`).join(", ")}`);
  console.log(`  Pay link:  /pay/${id}`);
  console.log(`  Ledger:    /ledger/${id}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
