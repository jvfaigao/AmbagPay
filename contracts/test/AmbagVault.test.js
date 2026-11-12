const { expect } = require("chai");
const { ethers } = require("hardhat");

const P = (n) => ethers.parseEther(String(n)); // pesos -> 18 decimals
const RISK = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const h = (s) => ethers.id(s); // fake receipt hash

describe("AmbagVault", () => {
  let token, vault, admin, treasurer, adviser, agent, m1, m2, m3, vendor, stranger;

  beforeEach(async () => {
    [admin, treasurer, adviser, agent, m1, m2, m3, vendor, stranger] = await ethers.getSigners();
    token = await (await ethers.getContractFactory("MockPHP")).deploy();
    vault = await (await ethers.getContractFactory("AmbagVault")).deploy(token, P(1000), admin.address);

    await vault.grantRole(await vault.TREASURER_ROLE(), treasurer.address);
    await vault.grantRole(await vault.ADVISER_ROLE(), adviser.address);
    await vault.grantRole(await vault.AGENT_ROLE(), agent.address);

    // collection 0: ₱1,000 each, Printing cap ₱2,000, Food cap ₱5,000
    await vault.createCollection("Org Fee 1st Sem", P(1000), 0, ["Printing", "Food"], [P(2000), P(5000)]);

    for (const m of [m1, m2, m3]) {
      await token.connect(m).faucet();
      await token.connect(m).approve(vault, P(1000));
      await vault.connect(m).pay(0);
    }
  });

  it("1. member pays once, cannot pay twice", async () => {
    expect((await vault.getCollection(0)).totalCollected).to.equal(P(3000));
    await expect(vault.connect(m1).pay(0)).to.be.revertedWithCustomError(vault, "AlreadyPaid");
  });

  it("1b. payWithPermit works in one tx", async () => {
    await vault.createCollection("Shirt", P(300), 0, ["Shirt"], [P(300)]);
    await token.connect(stranger).faucet();
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const { chainId } = await ethers.provider.getNetwork();
    const sig = await stranger.signTypedData(
      { name: "Test Philippine Peso", version: "1", chainId, verifyingContract: await token.getAddress() },
      { Permit: [
        { name: "owner", type: "address" }, { name: "spender", type: "address" },
        { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
      ] },
      { owner: stranger.address, spender: await vault.getAddress(), value: P(300), nonce: 0, deadline }
    );
    const { v, r, s } = ethers.Signature.from(sig);
    await expect(vault.connect(stranger).payWithPermit(1, deadline, v, r, s)).to.emit(vault, "Paid");
  });

  it("2. agent proposal under ₱1,000 + treasurer approval executes", async () => {
    await vault.connect(agent).proposeExpense(0, 0, P(850), vendor.address, h("r1"), "gf://r1", RISK.LOW);
    await vault.connect(treasurer).approveExpense(0);
    await vault.executeExpense(0);
    expect(await token.balanceOf(vendor.address)).to.equal(P(850));
  });

  it("3. over ₱1,000 needs adviser", async () => {
    await vault.connect(agent).proposeExpense(0, 1, P(1500), vendor.address, h("r2"), "", RISK.LOW);
    await vault.connect(treasurer).approveExpense(0);
    await expect(vault.executeExpense(0)).to.be.revertedWithCustomError(vault, "AdviserRequired");
    await vault.connect(adviser).approveExpense(0);
    await vault.executeExpense(0);
  });

  it("4. HIGH risk needs adviser even for ₱100", async () => {
    await vault.connect(agent).proposeExpense(0, 0, P(100), vendor.address, h("r3"), "", RISK.HIGH);
    await vault.connect(treasurer).approveExpense(0);
    await expect(vault.executeExpense(0)).to.be.revertedWithCustomError(vault, "AdviserRequired");
  });

  it("5. duplicate receipt is blocked", async () => {
    await vault.connect(agent).proposeExpense(0, 0, P(100), vendor.address, h("dup"), "", RISK.LOW);
    await expect(
      vault.connect(agent).proposeExpense(0, 0, P(100), vendor.address, h("dup"), "", RISK.LOW)
    ).to.be.revertedWithCustomError(vault, "ReceiptAlreadyUsed");
  });

  it("6. over category cap is blocked", async () => {
    await expect(
      vault.connect(agent).proposeExpense(0, 0, P(2500), vendor.address, h("r4"), "", RISK.LOW)
    ).to.be.revertedWithCustomError(vault, "OverBudget");
  });

  it("7. treasurer manual proposal is HIGH risk and needs adviser", async () => {
    await vault.connect(treasurer).proposeExpense(0, 0, P(100), vendor.address, h("r5"), "", RISK.LOW);
    const e = await vault.getExpense(0);
    expect(e.risk).to.equal(RISK.HIGH);
    await expect(vault.connect(treasurer).approveExpense(0)).to.be.revertedWithCustomError(vault, "AlreadyApproved");
    await expect(vault.executeExpense(0)).to.be.revertedWithCustomError(vault, "AdviserRequired");
    await vault.connect(adviser).approveExpense(0);
    await vault.executeExpense(0);
  });

  it("8. rejected receipt can be proposed again", async () => {
    await vault.connect(agent).proposeExpense(0, 0, P(100), vendor.address, h("r6"), "", RISK.LOW);
    await vault.connect(treasurer).rejectExpense(0, "wrong category");
    await vault.connect(agent).proposeExpense(0, 1, P(100), vendor.address, h("r6"), "", RISK.LOW);
  });

  it("9. close + refund once", async () => {
    await vault.connect(agent).proposeExpense(0, 0, P(900), vendor.address, h("r7"), "", RISK.LOW);
    await expect(vault.closeCollection(0)).to.be.revertedWithCustomError(vault, "PendingExpenses");
    await vault.connect(treasurer).approveExpense(0);
    await vault.executeExpense(0);
    await vault.closeCollection(0);
    expect((await vault.getCollection(0)).refundPerMember).to.equal(P(700)); // (3000-900)/3
    await vault.connect(m1).claimRefund(0);
    await expect(vault.connect(m1).claimRefund(0)).to.be.revertedWithCustomError(vault, "NothingToClaim");
    await expect(vault.connect(stranger).claimRefund(0)).to.be.revertedWithCustomError(vault, "NothingToClaim");
  });

  it("10. agent cannot approve; stranger cannot propose", async () => {
    await vault.connect(agent).proposeExpense(0, 0, P(100), vendor.address, h("r8"), "", RISK.LOW);
    await expect(vault.connect(agent).approveExpense(0)).to.be.revertedWithCustomError(vault, "NotApprover");
    await expect(vault.executeExpense(0)).to.be.revertedWithCustomError(vault, "NotApproved");
    await expect(
      vault.connect(stranger).proposeExpense(0, 0, P(100), vendor.address, h("r9"), "", RISK.LOW)
    ).to.be.revertedWithCustomError(vault, "NotProposer");
  });
});
