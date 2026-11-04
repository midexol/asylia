//! Lifeboat's vault, run inside an OutLayer TEE.
//!
//! Input on stdin (JSON), output on stdout (JSON, at most 900 bytes):
//!   {"op":"seal","escape":{"id","chain","network","txs":[hex...]}}  store an escape, encrypted
//!   {"op":"status"}                                                 counts only, never contents
//!   {"op":"release","network":"mainnet"|"testnet"}                  check the canaries; if eight or
//!                                                                   more moved in a day, broadcast
//!                                                                   every sealed escape on that network
//!
//! The release decision is made here, from chain data this code fetches itself. Whoever calls
//! "release" can only ask; the vault answers by the rule. And escapes were signed by their owners
//! to their own safe addresses, so releasing can never send coins anywhere else.

mod rules;
mod seal;

#[cfg(target_arch = "wasm32")]
mod host;

#[cfg(target_arch = "wasm32")]
fn main() {
    host::run();
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    eprintln!("Build for OutLayer: cargo build --target wasm32-wasip2 --release");
}
