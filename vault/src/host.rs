//! Everything that touches OutLayer's host interfaces: input/output, worker storage, HTTP.

use crate::rules::{self, Canary, Escape, Level, Spend};
use crate::seal;
use base64::{engine::general_purpose::STANDARD, Engine};
use outlayer::{env, storage};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use wasi_http_client::Client;

const INDEX: &str = "escapes";
const SECRET: &str = "vault-secret";
const MAINNET_CANARIES: &str = include_str!("../../data/canaries.json");
const TESTNET_CANARIES: &str = include_str!("../../data/canaries-testnet.json");

#[derive(Deserialize)]
struct Input {
    op: String,
    /// The escape, encrypted to the vault's public key (see seal.rs).
    #[serde(default)]
    sealed: Option<String>,
    #[serde(default)]
    network: Option<String>,
}

pub fn run() {
    let out = match env::input_json::<Input>() {
        Ok(Some(input)) => handle(input),
        _ => json!({ "ok": false, "error": "send JSON with an op: pubkey, seal, status or release" }),
    };
    let _ = env::output_json(&out);
}

fn handle(input: Input) -> Value {
    let result = match input.op.as_str() {
        "pubkey" => vault_secret().map(|s| json!({ "ok": true, "pubkey": STANDARD.encode(seal::public_of(&s)) })),
        "seal" => seal_escape(input.sealed),
        "status" => status(),
        "release" => release(input.network.as_deref().unwrap_or("mainnet")),
        other => Err(format!("unknown op {other}")),
    };
    result.unwrap_or_else(|e| json!({ "ok": false, "error": e }))
}

fn index() -> Result<Vec<String>, String> {
    Ok(match storage::get_worker(INDEX).map_err(|e| e.to_string())? {
        Some(raw) => serde_json::from_slice(&raw).unwrap_or_default(),
        None => vec![],
    })
}

/// The vault's X25519 secret: made from enclave randomness on first use, then kept in encrypted
/// worker storage that only this project's code can read. It never leaves the enclave.
fn vault_secret() -> Result<[u8; 32], String> {
    if let Some(raw) = storage::get_worker(SECRET).map_err(|e| e.to_string())? {
        return raw.try_into().map_err(|_| "stored vault key is corrupt".to_string());
    }
    let mut fresh = [0u8; 32];
    getrandom::fill(&mut fresh).map_err(|e| e.to_string())?;
    storage::set_worker(SECRET, &fresh).map_err(|e| e.to_string())?;
    // Read back, in case another run stored a key first: everyone must use the same one.
    let raw = storage::get_worker(SECRET).map_err(|e| e.to_string())?.ok_or("vault key vanished")?;
    raw.try_into().map_err(|_| "stored vault key is corrupt".to_string())
}

fn seal_escape(sealed: Option<String>) -> Result<Value, String> {
    let blob = sealed.ok_or("missing sealed escape")?;
    let plain = seal::open(&vault_secret()?, &blob)?;
    let mut e: Escape = serde_json::from_slice(&plain).map_err(|_| "sealed escape is not a valid escape")?;
    rules::validate(&e)?;
    e.released = false;
    let key = format!("escape:{}", e.id);
    if let Some(existing) = storage::get_worker(&key).map_err(|x| x.to_string())? {
        let old: Option<Escape> = serde_json::from_slice(&existing).ok();
        if old.as_ref().map(|o| o.txs != e.txs).unwrap_or(true) {
            return Err("an escape with this id is already sealed".into());
        }
    }
    storage::set_worker(&key, &serde_json::to_vec(&e).map_err(|x| x.to_string())?).map_err(|x| x.to_string())?;
    let mut ids = index()?;
    if !ids.contains(&e.id) {
        ids.push(e.id.clone());
        storage::set_worker(INDEX, &serde_json::to_vec(&ids).map_err(|x| x.to_string())?).map_err(|x| x.to_string())?;
    }
    Ok(json!({ "ok": true, "sealed": e.id, "count": ids.len() }))
}

fn load(id: &str) -> Option<Escape> {
    storage::get_worker(&format!("escape:{id}")).ok().flatten().and_then(|raw| serde_json::from_slice(&raw).ok())
}

fn status() -> Result<Value, String> {
    let ids = index()?;
    let released = ids.iter().filter_map(|id| load(id)).filter(|e| e.released).count();
    Ok(json!({ "ok": true, "sealed": ids.len(), "released": released }))
}

// ---------- chain access ----------

fn get(url: &str) -> Result<Vec<u8>, String> {
    let r = Client::new()
        .get(url)
        .header("User-Agent", "lifeboat-vault/0.1")
        .connect_timeout(Duration::from_secs(5))
        .send()
        .map_err(|e| format!("{url}: {e}"))?;
    if !(200..300).contains(&r.status()) {
        return Err(format!("{url}: HTTP {}", r.status()));
    }
    r.body().map_err(|e| e.to_string())
}

fn post(url: &str, content_type: &str, body: &[u8]) -> Result<Vec<u8>, String> {
    let r = Client::new()
        .post(url)
        .header("User-Agent", "lifeboat-vault/0.1")
        .header("Content-Type", content_type)
        .connect_timeout(Duration::from_secs(5))
        .body(body)
        .send()
        .map_err(|e| format!("{url}: {e}"))?;
    let status = r.status();
    let raw = r.body().map_err(|e| e.to_string())?;
    if !(200..300).contains(&status) {
        return Err(format!("HTTP {}: {}", status, String::from_utf8_lossy(&raw).chars().take(120).collect::<String>()));
    }
    Ok(raw)
}

fn mempool(network: &str) -> &'static str {
    if network == "testnet" { "https://mempool.space/testnet4/api" } else { "https://mempool.space/api" }
}

fn evm_rpc(chain: &str, network: &str) -> &'static str {
    match (chain, network) {
        ("ethereum", "mainnet") => "https://ethereum-rpc.publicnode.com",
        ("ethereum", _) => "https://ethereum-sepolia-rpc.publicnode.com",
        ("bsc", "mainnet") => "https://bsc-rpc.publicnode.com",
        _ => "https://bsc-testnet-rpc.publicnode.com",
    }
}

fn canary_spends(network: &str) -> Result<(u64, Vec<Spend>), String> {
    let list: Value = serde_json::from_str(if network == "testnet" { TESTNET_CANARIES } else { MAINNET_CANARIES })
        .map_err(|e| e.to_string())?;
    let canaries: Vec<Canary> = serde_json::from_value(list["canaries"].clone()).map_err(|e| e.to_string())?;
    if canaries.is_empty() {
        return Err(format!("no canaries are set up on {network}"));
    }
    let base = mempool(network);
    let tip: u64 = String::from_utf8_lossy(&get(&format!("{base}/blocks/tip/height"))?).trim().parse().map_err(|_| "bad tip height")?;
    let mut spends = Vec::with_capacity(canaries.len());
    for c in &canaries {
        let v: Value = serde_json::from_slice(&get(&format!("{base}/tx/{}/outspend/{}", c.txid, c.vout))?).map_err(|e| e.to_string())?;
        spends.push(if v["spent"].as_bool() == Some(true) {
            Spend::Spent(if v["status"]["confirmed"].as_bool() == Some(true) { v["status"]["block_height"].as_u64() } else { None })
        } else {
            Spend::Unspent
        });
    }
    Ok((tip, spends))
}

fn broadcast(e: &Escape) -> Result<usize, String> {
    let mut sent = 0;
    for tx in &e.txs {
        let result = if e.chain == "bitcoin" {
            post(&format!("{}/tx", mempool(&e.network)), "text/plain", tx.trim_start_matches("0x").as_bytes())
        } else {
            let hex = if tx.starts_with("0x") { tx.clone() } else { format!("0x{tx}") };
            let body = json!({ "jsonrpc": "2.0", "id": 1, "method": "eth_sendRawTransaction", "params": [hex] });
            post(evm_rpc(&e.chain, &e.network), "application/json", body.to_string().as_bytes()).and_then(|raw| {
                let v: Value = serde_json::from_slice(&raw).map_err(|x| x.to_string())?;
                match v.get("error") {
                    // A transaction already known or mined counts as sent.
                    Some(err) if !err.to_string().contains("already known") && !err.to_string().contains("nonce too low") => Err(err.to_string()),
                    _ => Ok(raw),
                }
            })
        };
        match result {
            Ok(_) => sent += 1,
            Err(err) if err.contains("already") || err.contains("txn-mempool-conflict") || err.contains("missingorspent") => sent += 1,
            Err(err) => return Err(err),
        }
    }
    Ok(sent)
}

fn release(network: &str) -> Result<Value, String> {
    if network != "mainnet" && network != "testnet" {
        return Err("network must be mainnet or testnet".into());
    }
    let (tip, spends) = canary_spends(network)?;
    let (level, recent) = rules::assess(&spends, tip);
    if level != Level::Release {
        return Ok(json!({ "ok": true, "level": level, "recent": recent, "released": 0, "note": "the canaries are not moving like an attack; nothing released" }));
    }
    let mut released = 0;
    let mut failed: Vec<String> = vec![];
    for id in index()? {
        let Some(mut e) = load(&id) else { continue };
        if e.released || e.network != network {
            continue;
        }
        match broadcast(&e) {
            Ok(_) => {
                e.released = true;
                let _ = storage::set_worker(&format!("escape:{id}"), &serde_json::to_vec(&e).unwrap_or_default());
                released += 1;
            }
            Err(err) => failed.push(format!("{id}: {}", err.chars().take(60).collect::<String>())),
        }
    }
    failed.truncate(5);
    Ok(json!({ "ok": true, "level": level, "recent": recent, "released": released, "failed": failed }))
}
