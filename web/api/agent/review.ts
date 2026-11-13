// POST /api/agent/review — Treasurer Agent, fixed pipeline (docs/AGENT.md fallback):
// read → duplicate → budget → history → risk → simulate → propose. The model only returns data; this code acts.
import { BaseError, ContractFunctionRevertedError, formatEther, isAddress, keccak256, parseEther, parseEventLogs, toBytes } from "viem";
import { ambagVaultAbi } from "../../src/abi/AmbagVault.js";
import { agentClient, publicClient, VAULT_ADDRESS } from "../_lib/chain.js";
import { callerWallet } from "../_lib/auth.js";
import { storeReceiptImage } from "../_lib/cloudinary.js";
import { receipts } from "../_lib/firebase.js";
import { readReceipt, reviewRisk, type Extraction, type ModelReview } from "../_lib/gemini.js";
import { findSimilar, isSplit, RISK, riskFloor, type PastReceipt, type RiskLevel } from "../_lib/risk.js";

// Vercel rejects request bodies over 4.5 MB; 3 MB of image ≈ 4 MB of base64.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const TREASURER_ROLE = keccak256(toBytes("TREASURER_ROLE"));

const vault = { address: VAULT_ADDRESS, abi: ambagVaultAbi } as const;
const json = (body: object, status = 200) => Response.json(body, { status });
const pesos = (wei: bigint) => Number(formatEther(wei));
const php = (n: number) => "₱" + n.toLocaleString("en-PH", { maximumFractionDigits: 2 });

type Body = { collectionId?: number; imageBase64?: string; mimeType?: string; payee?: string; categoryIndex?: number | null };

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    // 1) Validate input (trust boundary).
    const body = (await request.json().catch(() => null)) as Body | null;
    const { collectionId, imageBase64, mimeType, payee, categoryIndex: chosenIndex } = body ?? {};
    if (!Number.isInteger(collectionId) || collectionId! < 0) return json({ error: "Invalid collectionId" }, 400);
    const chosen = chosenIndex ?? null; // treasurer's category pick; null = let the AI choose
    if (chosen !== null && (!Number.isInteger(chosen) || chosen < 0)) return json({ error: "Invalid categoryIndex" }, 400);
    if (!payee || !isAddress(payee)) return json({ error: "Invalid payee" }, 400);
    if (!mimeType || !IMAGE_TYPES.includes(mimeType)) return json({ error: "Receipt must be a JPG, PNG, WEBP or HEIC image" }, 400);
    if (typeof imageBase64 !== "string" || imageBase64.length === 0) return json({ error: "Missing image" }, 400);
    const bytes = Buffer.from(imageBase64, "base64");
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return json({ error: "Image must be under 3 MB" }, 400);
    const id = BigInt(collectionId!);

    try {
      // The uploader is proven by the Privy token, not taken from the body.
      const uploader = await callerWallet(request);
      if (!uploader) return json({ error: "Mag-login muna." }, 401);
      const isTreasurer = await publicClient.readContract({ ...vault, functionName: "hasRole", args: [TREASURER_ROLE, uploader] });
      if (!isTreasurer) return json({ error: "Treasurer lang ang puwedeng mag-upload ng resibo." }, 403);

      // 2) Hash is computed here from the raw bytes, never by the client or the model.
      const receiptHash = keccak256(bytes);
      const [categories, duplicate, adviserThreshold] = await Promise.all([
        publicClient.readContract({ ...vault, functionName: "getCategories", args: [id] }),
        publicClient.readContract({ ...vault, functionName: "receiptInUse", args: [receiptHash] }),
        publicClient.readContract({ ...vault, functionName: "adviserThreshold" }),
      ]);

      // Duplicate: the chain already knows, so skip the AI and let the contract itself refuse it (simulate only, no tx).
      if (duplicate) {
        const original = await receipts()
          .doc(receiptHash)
          .get()
          .then((d) => d.data())
          .catch(() => undefined);
        let blockedBy = "ReceiptAlreadyUsed";
        try {
          const args = [id, 0, 1n, payee, receiptHash, "", 2] as const; // receiptInUse is checked before amount/category
          await publicClient.simulateContract({ ...vault, account: agentClient().account, functionName: "proposeExpense", args });
        } catch (e) {
          blockedBy = revertName(e) ?? blockedBy;
        }
        const seenAs = original?.expenseId !== undefined ? ` (Expense #${original.expenseId})` : "";
        return json({
          receiptHash,
          imageUrl: original?.imageUrl ?? "",
          extracted: original?.extracted ?? null,
          categoryIndex: original?.categoryIndex ?? -1,
          checks: [{ id: "duplicate", pass: false, label: `Nagamit na ang resibong ito${seenAs}` }],
          risk: "HIGH",
          reason: `Nagamit na ang resibong ito${seenAs}. Hinarang ng AmbagVault; walang perang gumalaw.`,
          outcome: "blocked",
          blockedBy,
        });
      }

      const imageUrl = await storeReceiptImage(receiptHash, bytes, mimeType).catch((e) => {
        console.error("image upload failed:", errText(e));
        return "";
      });

      // 3) Read the receipt (model returns data only).
      let extracted: Extraction | null = null;
      let aiFailed = false;
      try {
        extracted = await readReceipt(imageBase64, mimeType, categories.map((c) => c.name));
      } catch (e) {
        console.error("readReceipt failed:", errText(e));
        aiFailed = true;
      }

      const amount = extracted?.total ?? null;
      const guess = extracted?.categoryGuess?.trim().toLowerCase();
      const aiIndex = categories.findIndex((c) => c.name.toLowerCase() === guess);
      if (chosen !== null && chosen >= categories.length) return json({ error: "Invalid categoryIndex" }, 400);
      // The treasurer may file it elsewhere, but a disagreement with the AI is flagged (MEDIUM) for the adviser and the ledger.
      const categoryIndex = chosen ?? aiIndex;
      const categoryMismatch = chosen !== null && chosen !== aiIndex;
      const category = categories[categoryIndex];
      const remaining = category ? pesos(category.cap - category.spent) : 0;

      // 4) Memory: past receipts of this collection from Firestore.
      const history = await pastReceipts(collectionId!).catch((e) => {
        console.error("history failed:", errText(e));
        return [];
      });
      const sameCategory = history.filter((h) => h.categoryIndex === categoryIndex);
      const pastAmounts = sameCategory.map((h) => h.total).filter((n): n is number => typeof n === "number");
      const vendor = extracted?.vendor?.trim().toLowerCase();
      const vendorSeen = !!vendor && history.some((h) => h.vendor?.trim().toLowerCase() === vendor);
      const similarExpense = findSimilar(history, extracted?.vendor ?? null, amount, extracted?.date ?? null);
      const splitPattern = isSplit(history, payee, amount, pesos(adviserThreshold), Date.now());

      // 5) Risk: code floor first, the model can only raise it.
      const floor = riskFloor({
        aiFailed,
        readable: extracted?.readable ?? false,
        amount,
        categoryKnown: categoryIndex >= 0,
        categoryMismatch,
        duplicate,
        suspiciousText: extracted?.suspiciousText ?? [],
        remaining,
        pastAmounts,
        vendorSeen,
        similarExpense,
        splitPattern,
      });

      let model: ModelReview | null = null;
      if (!aiFailed) {
        try {
          model = await reviewRisk({
            extracted,
            category: category?.name ?? null,
            budgetLeft: remaining,
            duplicate,
            pastSameCategory: sameCategory.slice(0, 10).map((h) => ({ vendor: h.vendor, total: h.total, date: h.date })),
            vendorSeenBefore: vendorSeen,
            codeFindings: floor.reasons,
          });
        } catch (e) {
          console.error("reviewRisk failed:", errText(e));
        }
      }
      const modelRisk = (model ? RISK.indexOf(model.risk) : 2) as RiskLevel; // no model verdict = fail closed
      const risk = Math.max(floor.risk, modelRisk) as RiskLevel;
      const reason = model
        ? model.reason + (floor.reasons.length ? ` (${floor.reasons.join("; ")})` : "")
        : floor.reasons.join("; ") || "AI review unavailable — kailangan ng human review";

      const avg = pastAmounts.length ? pastAmounts.reduce((a, b) => a + b, 0) / pastAmounts.length : 0;
      const hidden = (extracted?.suspiciousText.length ?? 0) > 0 || !!model?.flags.includes("hidden_instruction");
      const checks = [
        { id: "duplicate", pass: !duplicate, label: duplicate ? "Nagamit na ang resibong ito" : "Receipt not used before" },
        {
          id: "budget",
          pass: amount !== null && amount <= remaining,
          label: category ? `${amount !== null && amount <= remaining ? "Within" : "Over"} ${category.name} budget (${php(remaining)} left)` : "No matching category",
        },
        {
          id: "price",
          pass: !(avg > 0 && amount !== null && amount > 1.5 * avg),
          label: avg > 0 ? `Compared with past ${category?.name} expenses (avg ${php(avg)})` : "No past expenses to compare yet",
        },
        { id: "injection", pass: !hidden, label: hidden ? "Hidden instructions found in receipt" : "No hidden instructions found" },
        ...(similarExpense !== null
          ? [{ id: "similar", pass: false, label: `Same vendor, amount and date as ${similarExpense >= 0 ? `Expense #${similarExpense}` : "an earlier receipt"}` }]
          : []),
        ...(splitPattern ? [{ id: "split", pass: false, label: `Several small expenses to the same payee within 24 h add up to over ${php(pesos(adviserThreshold))}` }] : []),
        ...(categoryMismatch
          ? [{ id: "category", pass: false, label: `Treasurer chose ${category?.name}; AI guessed ${categories[aiIndex]?.name ?? "none"}` }]
          : []),
      ];

      const result = { receiptHash, imageUrl, extracted, categoryIndex, checks, risk: RISK[risk], reason };

      // 6) Cannot propose without a readable amount and a real category.
      if (amount === null || !(amount > 0) || categoryIndex < 0) {
        return json({ ...result, outcome: "blocked", blockedBy: amount === null || !(amount > 0) ? "UnreadableAmount" : "UnknownCategory" });
      }

      // 7) Simulate first: the contract decides (duplicate, over budget, …). No tx if it would revert.
      const agent = agentClient();
      const args = [id, categoryIndex, parseEther(amount.toFixed(2)), payee, receiptHash, imageUrl, risk] as const;
      let request_;
      try {
        ({ request: request_ } = await publicClient.simulateContract({ ...vault, account: agent.account, functionName: "proposeExpense", args }));
      } catch (e) {
        const blockedBy = revertName(e);
        if (blockedBy) return json({ ...result, risk: "HIGH", outcome: "blocked", blockedBy });
        throw e;
      }

      const txHash = await agent.writeContract(request_);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") throw new Error("proposeExpense reverted");
      const [event] = parseEventLogs({ abi: ambagVaultAbi, logs: receipt.logs, eventName: "ExpenseProposed" });
      const expenseId = Number(event.args.expenseId);

      // 8) Save for history + ledger titles. Only proposed receipts, so a duplicate never overwrites the original.
      await receipts()
        .doc(receiptHash)
        .set({ collectionId, categoryIndex, payee, imageUrl, extracted, risk: RISK[risk], reason, checks, expenseId, txHash, createdAt: Date.now() })
        .catch((e) => console.error("save failed:", errText(e)));

      return json({ ...result, outcome: "proposed", expenseId, txHash, blockedBy: null });
    } catch (e) {
      console.error("review failed:", errText(e));
      return json({ error: "Hindi natapos ang review. Subukan ulit." }, 500);
    }
  },
};

async function pastReceipts(collectionId: number): Promise<(PastReceipt & { categoryIndex: number })[]> {
  // Single-field filter (no composite index needed); sort in code. Data is small.
  const snap = await receipts().where("collectionId", "==", collectionId).get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        categoryIndex: x.categoryIndex,
        vendor: x.extracted?.vendor ?? null,
        total: x.extracted?.total ?? null,
        date: x.extracted?.date ?? null,
        payee: x.payee ?? null, // older docs have no payee
        expenseId: x.expenseId ?? null,
        createdAt: x.createdAt,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Custom error name when the contract reverted (e.g. "ReceiptAlreadyUsed"); undefined for other failures. */
function revertName(e: unknown): string | undefined {
  const revert = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
  return revert instanceof ContractFunctionRevertedError ? (revert.data?.errorName ?? "Reverted") : undefined;
}

// Never log request bodies or keys; only the error message.
function errText(e: unknown) {
  return e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e);
}
