// What the Upgrade NEAR screen tells someone, from the keys on their account. Pure.
import type { NearKey } from "../sources";

export type UpgradeState = "needs-upgrade" | "upgraded" | "upgraded-only" | "no-full-access";

export function upgradeState(keys: NearKey[]): UpgradeState {
  const full = keys.filter((k) => k.fullAccess);
  const pq = full.filter((k) => k.kind === "quantum-safe");
  const classic = full.filter((k) => k.kind === "classic");
  if (!full.length) return "no-full-access";
  if (!pq.length) return "needs-upgrade";
  return classic.length ? "upgraded" : "upgraded-only";
}

/**
 * NEAR CLI (near-cli-rs 0.29+) commands for the upgrade. The new key is generated on the
 * owner's own computer and stays in its keychain: no website ever holds it.
 */
export function cliCommands(accountId: string, network: "mainnet" | "testnet") {
  return {
    install: "npm install -g near-cli-rs@latest",
    signIn: `near account import-account using-web-wallet network-config ${network}`,
    addKey: `near account add-key ${accountId} grant-full-access autogenerate-new-keypair --signature-scheme ml-dsa-65 save-to-keychain network-config ${network} sign-with-keychain send`,
    listKeys: `near account list-keys ${accountId} network-config ${network} now`,
  };
}
