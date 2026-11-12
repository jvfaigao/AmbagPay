// LOCAL ONLY: fills a local Hardhat node with demo data so the frontend has something to show.
// Uses Hardhat's built-in test accounts. Refuses to run on any real network.
//
// Terminal 1: npx hardhat node
// Terminal 2: npx hardhat run scripts/deploy.js --network localhost
//             npx hardhat run scripts/seed-local.js --network localhost
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const P = (n) => ethers.parseEther(String(n));
const RISK = { LOW: 0, MEDIUM: 1, HIGH: 2 };

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== 31337n) throw new Error("seed-local.js is for the local Hardhat chain only.");

  const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  const { AmbagVault, MockPHP } = JSON.parse(fs.readFileSync(file, "utf8"));
  const vault = await ethers.getContractAt("AmbagVault", AmbagVault);
  const token = await ethers.getContractAt("MockPHP", MockPHP);

  const signers = await ethers.getSigners();
  const [admin, treasurer, adviser, agent, vendor] = signers;

  // 30 throwaway member wallets, each given a little local ETH for gas
  const members = [];
  for (let i = 0; i < 30; i++) {
    const w = ethers.Wallet.createRandom().connect(ethers.provider);
    await (await admin.sendTransaction({ to: w.address, value: ethers.parseEther("0.05") })).wait();
    members.push(w);
  }

  await (await vault.grantRole(await vault.TREASURER_ROLE(), treasurer.address)).wait();
  await (await vault.grantRole(await vault.ADVISER_ROLE(), adviser.address)).wait();
  await (await vault.grantRole(await vault.AGENT_ROLE(), agent.address)).wait();

  // Members pay ₱150 each
  for (const m of members) {
    await (await token.connect(admin).mint(m.address, P(1000))).wait();
    await (await token.connect(m).approve(AmbagVault, P(150))).wait();
    await (await vault.connect(m).pay(0)).wait();
  }
  console.log(`${members.length} members paid collection 0`);

  // #0 Printing ₱850, LOW → treasurer approves → paid
  await (await vault.connect(agent).proposeExpense(0, 0, P(850), vendor.address, ethers.id("r1-tarp"), "", RISK.LOW)).wait();
  await (await vault.connect(treasurer).approveExpense(0)).wait();
  await (await vault.executeExpense(0)).wait();

  // #1 Food ₱1,240 → needs treasurer + adviser → paid
  await (await vault.connect(agent).proposeExpense(0, 1, P(1240), vendor.address, ethers.id("r2-snacks"), "", RISK.LOW)).wait();
  await (await vault.connect(treasurer).approveExpense(1)).wait();
  await (await vault.connect(adviser).approveExpense(1)).wait();
  await (await vault.executeExpense(1)).wait();

  // #2 Printing ₱850, HIGH → rejected
  await (await vault.connect(agent).proposeExpense(0, 0, P(850), vendor.address, ethers.id("r3-injection"), "", RISK.HIGH)).wait();
  await (await vault.connect(adviser).rejectExpense(2, "Hidden instruction on receipt")).wait();

  // #3 Shirts ₱600, MEDIUM → still pending
  await (await vault.connect(agent).proposeExpense(0, 2, P(600), vendor.address, ethers.id("r4-shirts"), "", RISK.MEDIUM)).wait();

  console.log("Seeded 4 expenses: paid, paid (adviser), rejected, pending");
  console.log(`Treasurer: ${treasurer.address}\nAdviser:   ${adviser.address}\nAgent:     ${agent.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
