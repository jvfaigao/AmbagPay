// Receipt images on Cloudinary (free tier), via the signed REST upload. No SDK needed.
import { createHash } from "node:crypto";

/** Cloudinary signature: sorted name=value pairs joined by &, secret appended, SHA-1 hex. */
export function signParams(params: Record<string, string>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

/** Uploads the receipt image and returns its public https URL. */
export async function storeReceiptImage(receiptHash: string, bytes: Buffer, mimeType: string): Promise<string> {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!cloud || !apiKey || !secret) throw new Error("Cloudinary env vars are not set");

  const params = { public_id: `ambagpay/receipts/${receiptHash}`, timestamp: String(Math.floor(Date.now() / 1000)) };
  const form = new FormData();
  form.set("file", `data:${mimeType};base64,${bytes.toString("base64")}`);
  form.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) form.set(k, v);
  form.set("signature", signParams(params, secret));

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form });
  const out = (await res.json()) as { secure_url?: string; error?: { message: string } };
  if (!res.ok || !out.secure_url) throw new Error(`Cloudinary upload failed: ${out.error?.message ?? res.status}`);
  return out.secure_url;
}
