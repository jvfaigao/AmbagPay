// Who is calling? Verify the Privy access token and return the caller's embedded wallet address.
// The address comes from Privy, never from the request body, so it cannot be faked.
import { PrivyClient } from "@privy-io/node";

let client: PrivyClient | undefined;
function privy() {
  const { PRIVY_APP_ID: appId, PRIVY_APP_SECRET: appSecret } = process.env;
  if (!appId || !appSecret) throw new Error("PRIVY_APP_ID / PRIVY_APP_SECRET are not set");
  return (client ??= new PrivyClient({ appId, appSecret }));
}

/** The caller's embedded wallet address and Google email, or null when the token is missing/invalid. */
export async function callerAccount(request: Request): Promise<{ address: `0x${string}`; email: string | null } | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  try {
    const { user_id } = await privy().utils().auth().verifyAccessToken(token);
    const user = await privy().users()._get(user_id);
    const wallet = user.linked_accounts.find(
      (a) => a.type === "wallet" && "connector_type" in a && a.connector_type === "embedded" && a.chain_type === "ethereum",
    );
    if (!wallet || !("address" in wallet)) return null;
    const google = user.linked_accounts.find((a) => a.type === "google_oauth");
    const email = google && "email" in google ? String(google.email).toLowerCase() : null;
    return { address: wallet.address as `0x${string}`, email };
  } catch (e) {
    console.error("auth failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** The caller's embedded wallet address, or null when the token is missing/invalid. */
export async function callerWallet(request: Request): Promise<`0x${string}` | null> {
  return (await callerAccount(request))?.address ?? null;
}
