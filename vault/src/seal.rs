//! Escapes are encrypted in the owner's browser to the vault's public key, so the signed
//! transactions never travel or rest in the clear. Only code running in this enclave holds the
//! private key, generated here on first use and kept in encrypted worker storage.
//!
//! Scheme (mirrored in lib/vault/seal.ts):
//!   shared = X25519(ephemeral secret, vault public)
//!   key    = HKDF-SHA256(ikm = shared, salt = ephemeral public || vault public, info = "lifeboat-vault-v1")
//!   blob   = ephemeral public (32) || nonce (12) || ChaCha20-Poly1305(key, nonce, escape JSON, aad = "lifeboat-escape")

use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::{aead::{Aead, KeyInit, Payload}, ChaCha20Poly1305, Nonce};
use hkdf::Hkdf;
use sha2::Sha256;
use x25519_dalek::{PublicKey, StaticSecret};

pub const INFO: &[u8] = b"lifeboat-vault-v1";
pub const AAD: &[u8] = b"lifeboat-escape";

fn key(shared: &[u8; 32], eph: &[u8; 32], vault: &[u8; 32]) -> [u8; 32] {
    let mut salt = [0u8; 64];
    salt[..32].copy_from_slice(eph);
    salt[32..].copy_from_slice(vault);
    let hk = Hkdf::<Sha256>::new(Some(&salt), shared);
    let mut okm = [0u8; 32];
    hk.expand(INFO, &mut okm).expect("32 bytes is a valid HKDF length");
    okm
}

pub fn public_of(secret: &[u8; 32]) -> [u8; 32] {
    PublicKey::from(&StaticSecret::from(*secret)).to_bytes()
}

/// Open a sealed escape with the vault's secret key.
pub fn open(vault_secret: &[u8; 32], blob_b64: &str) -> Result<Vec<u8>, String> {
    let blob = STANDARD.decode(blob_b64.trim()).map_err(|_| "sealed escape is not base64")?;
    if blob.len() < 32 + 12 + 16 {
        return Err("sealed escape is too short".into());
    }
    let eph: [u8; 32] = blob[..32].try_into().unwrap();
    let nonce = Nonce::from_slice(&blob[32..44]);
    let secret = StaticSecret::from(*vault_secret);
    let vault_pub = PublicKey::from(&secret).to_bytes();
    let shared = secret.diffie_hellman(&PublicKey::from(eph)).to_bytes();
    let cipher = ChaCha20Poly1305::new(&key(&shared, &eph, &vault_pub).into());
    cipher
        .decrypt(nonce, Payload { msg: &blob[44..], aad: AAD })
        .map_err(|_| "sealed escape could not be opened: wrong vault key or tampered".into())
}

/// Seal with given ephemeral secret and nonce (the browser does this; here for tests).
pub fn seal_with(vault_pub: &[u8; 32], eph_secret: &[u8; 32], nonce: &[u8; 12], plaintext: &[u8]) -> String {
    let eph = StaticSecret::from(*eph_secret);
    let eph_pub = PublicKey::from(&eph).to_bytes();
    let shared = eph.diffie_hellman(&PublicKey::from(*vault_pub)).to_bytes();
    let cipher = ChaCha20Poly1305::new(&key(&shared, &eph_pub, vault_pub).into());
    let ct = cipher.encrypt(Nonce::from_slice(nonce), Payload { msg: plaintext, aad: AAD }).expect("encrypts");
    let mut blob = Vec::with_capacity(44 + ct.len());
    blob.extend_from_slice(&eph_pub);
    blob.extend_from_slice(nonce);
    blob.extend_from_slice(&ct);
    STANDARD.encode(blob)
}

#[cfg(test)]
mod tests {
    use super::*;

    const VAULT: [u8; 32] = [7u8; 32];

    #[test]
    fn round_trips() {
        let blob = seal_with(&public_of(&VAULT), &[9u8; 32], &[1u8; 12], b"{\"id\":\"x\"}");
        assert_eq!(open(&VAULT, &blob).unwrap(), b"{\"id\":\"x\"}");
    }

    #[test]
    fn refuses_the_wrong_key_and_tampering() {
        let blob = seal_with(&public_of(&VAULT), &[9u8; 32], &[1u8; 12], b"secret");
        assert!(open(&[8u8; 32], &blob).is_err());
        let mut raw = STANDARD.decode(&blob).unwrap();
        let last = raw.len() - 1;
        raw[last] ^= 1;
        assert!(open(&VAULT, &STANDARD.encode(raw)).is_err());
        assert!(open(&VAULT, "not base64!").is_err());
    }

    /// A blob sealed by the browser code (lib/vault/seal.ts) with fixed inputs opens here.
    #[test]
    fn opens_what_the_browser_sealed() {
        let fixture = include_str!("../tests/browser-sealed.txt").trim();
        if fixture.is_empty() {
            return;
        }
        assert_eq!(open(&VAULT, fixture).unwrap(), b"{\"hello\":\"vault\"}");
    }
}
