// Where the vault lives. Its public key never changes once made (the secret half stays in the
// enclave), so it is pinned here and the browser can encrypt without asking the network.
export const VAULT = {
  network: "testnet" as const,
  outlayer: "outlayer.testnet",
  project: "lifeboat-f86cd6e7d4.testnet/lifeboat-vault",
  pubkey: "nocGRIvUKzFxTQnpflbIlWK55/90StOqZ4IL49QoX2w=",
  explorer: (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`,
};

/** While the vault is on OutLayer testnet it holds testnet escapes only. */
export const VAULT_ACCEPTS: ReadonlyArray<"mainnet" | "testnet"> = ["testnet"];

/** An escape id the vault accepts: the transaction id, letters, digits and dashes, at most 80. */
export function escapeId(txid: string): string {
  return txid.replace(/^0x/, "").replace(/[^0-9a-zA-Z-]/g, "").slice(0, 80);
}
