// firebase-admin (Firestore only) from FIREBASE_SERVICE_ACCOUNT (JSON string). Server only.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { CHAIN_ID } from "./chain.js";

function app() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export const db = () => getFirestore(app());

// One collection per chain, so local test receipts never show up on the testnet ledger.
export const receipts = () => db().collection(`receipts-${CHAIN_ID}`);
