import { describe, expect, it } from "vitest";
import { isValidEvm, parseAddress, splitInput } from "./address";

// Test vectors from BIP-173, BIP-350, BIP-16 and EIP-55.
describe("parseAddress", () => {
  it.each([
    ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "p2pkh", "mainnet"],
    ["3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", "p2sh", "mainnet"],
    ["BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", "p2wpkh", "mainnet"],
    ["bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3", "p2wsh", "mainnet"],
    ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0", "p2tr", "mainnet"],
    ["tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", "p2wpkh", "testnet"],
    ["mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn", "p2pkh", "testnet"],
  ])("reads %s as Bitcoin %s on %s", (input, kind, network) => {
    expect(parseAddress(input)).toMatchObject({ chain: "bitcoin", kind, network });
  });

  it("rejects Bitcoin addresses with a bad checksum or the wrong checksum type", () => {
    expect(parseAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5").chain).toBe("unknown");
    expect(parseAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb").chain).toBe("unknown");
    // Taproot (v1) encoded with the old bech32 checksum, invalid per BIP-350.
    expect(parseAddress("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd").chain).toBe("unknown");
    expect(parseAddress("bc1QW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4").chain).toBe("unknown"); // mixed case
  });

  it("checks EVM checksums and normalises case", () => {
    expect(isValidEvm("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toBe(true);
    expect(isValidEvm("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(true);
    expect(isValidEvm("0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toBe(false);
    expect(parseAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toEqual({
      chain: "evm",
      address: "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
    });
    expect(parseAddress("0x1234").chain).toBe("unknown");
  });

  it("reads NEAR named and implicit accounts", () => {
    expect(parseAddress("Alice.near")).toMatchObject({ chain: "near", address: "alice.near", network: "mainnet" });
    expect(parseAddress("lifeboat-demo.testnet")).toMatchObject({ chain: "near", network: "testnet" });
    expect(parseAddress("a".repeat(64))).toMatchObject({ chain: "near", implicit: true });
    expect(parseAddress("bad..near").chain).toBe("unknown");
    expect(parseAddress("hello").chain).toBe("unknown");
  });
});

describe("splitInput", () => {
  it("splits on lines, commas and spaces, dropping duplicates", () => {
    expect(splitInput("a.near\n b.near, a.near  0xAB\n0xab")).toEqual(["a.near", "b.near", "0xAB"]);
  });
});
