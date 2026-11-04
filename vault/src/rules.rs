//! The release rule, kept identical to the watchman's in lib/watchman/detect.ts.
//! Pure: canary states in, a level out. Unit-tested natively with `cargo test`.

use serde::{Deserialize, Serialize};

pub const WINDOW_BLOCKS: u64 = 144; // about a day
pub const ALARM_COUNT: usize = 3;
pub const RELEASE_COUNT: usize = 8;

#[derive(Debug, Clone, Deserialize)]
pub struct Canary {
    pub txid: String,
    pub vout: u32,
    #[serde(default)]
    pub height: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Spend {
    Unspent,
    /// Spent; `None` while waiting in the mempool.
    Spent(Option<u64>),
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Calm,
    Watch,
    Alarm,
    Release,
}

/// Count canaries spent within the window (the mempool counts as now) and grade the danger.
pub fn assess(spends: &[Spend], tip: u64) -> (Level, usize) {
    let recent = spends
        .iter()
        .filter(|s| match s {
            Spend::Unspent => false,
            Spend::Spent(None) => true,
            Spend::Spent(Some(h)) => tip.saturating_sub(*h) < WINDOW_BLOCKS,
        })
        .count();
    let level = if recent >= RELEASE_COUNT {
        Level::Release
    } else if recent >= ALARM_COUNT {
        Level::Alarm
    } else if recent >= 1 {
        Level::Watch
    } else {
        Level::Calm
    };
    (level, recent)
}

/// A sealed escape: signed transactions ready to broadcast, in order.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Escape {
    pub id: String,
    pub chain: String,   // "bitcoin" | "ethereum" | "bsc"
    pub network: String, // "mainnet" | "testnet"
    pub txs: Vec<String>,
    #[serde(default)]
    pub released: bool,
}

/// Check an escape before sealing: known chain and network, 1 to 10 hex transactions.
pub fn validate(e: &Escape) -> Result<(), String> {
    if !matches!(e.chain.as_str(), "bitcoin" | "ethereum" | "bsc") {
        return Err("chain must be bitcoin, ethereum or bsc".into());
    }
    if !matches!(e.network.as_str(), "mainnet" | "testnet") {
        return Err("network must be mainnet or testnet".into());
    }
    if e.id.is_empty() || e.id.len() > 80 || !e.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("id must be 1-80 letters, digits or dashes".into());
    }
    if e.txs.is_empty() || e.txs.len() > 10 {
        return Err("an escape holds 1 to 10 transactions".into());
    }
    for tx in &e.txs {
        let hex = tx.strip_prefix("0x").unwrap_or(tx);
        if hex.len() < 100 || hex.len() > 40_000 || hex.len() % 2 != 0 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err("each transaction must be signed transaction hex".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spends(recent: usize, old: usize, tip: u64) -> Vec<Spend> {
        let mut v = vec![Spend::Spent(Some(tip - 2)); recent];
        v.extend(vec![Spend::Spent(Some(tip - 500)); old]);
        v.extend(vec![Spend::Unspent; 60 - recent - old]);
        v
    }

    #[test]
    fn grades_like_the_watchman() {
        assert_eq!(assess(&spends(0, 0, 900_000), 900_000), (Level::Calm, 0));
        assert_eq!(assess(&spends(1, 0, 900_000), 900_000).0, Level::Watch);
        assert_eq!(assess(&spends(3, 0, 900_000), 900_000).0, Level::Alarm);
        assert_eq!(assess(&spends(8, 0, 900_000), 900_000).0, Level::Release);
    }

    #[test]
    fn old_moves_do_not_count_but_the_mempool_does() {
        assert_eq!(assess(&spends(0, 20, 900_000), 900_000), (Level::Calm, 0));
        let mut v = spends(0, 0, 900_000);
        for s in v.iter_mut().take(8) {
            *s = Spend::Spent(None);
        }
        assert_eq!(assess(&v, 900_000).0, Level::Release);
    }

    #[test]
    fn validates_escapes() {
        let good = Escape { id: "abc-1".into(), chain: "bitcoin".into(), network: "testnet".into(), txs: vec!["02".repeat(100)], released: false };
        assert!(validate(&good).is_ok());
        assert!(validate(&Escape { chain: "solana".into(), ..good.clone() }).is_err());
        assert!(validate(&Escape { txs: vec!["zz".repeat(100)], ..good.clone() }).is_err());
        assert!(validate(&Escape { txs: vec![], ..good.clone() }).is_err());
        assert!(validate(&Escape { id: "a b".into(), ..good.clone() }).is_err());
        assert!(validate(&Escape { txs: vec![format!("0x{}", "ab".repeat(100))], chain: "ethereum".into(), ..good }).is_ok());
    }
}
