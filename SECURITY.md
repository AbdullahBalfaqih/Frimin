# Security Architecture and Custody Boundary

## 1. Non-Custodial Paper-Trading Guarantee

Frimin is engineered strictly as an autonomous market-evidence interpreter and practice-trading desk:

- **Zero Wallet Private Keys:** The codebase neither accepts, generates, nor stores blockchain wallet private keys or seed phrases. All Ethereum and Solana Mainnet interactions use strictly read-only JSON-RPC calls (`eth_blockNumber`, `eth_gasPrice`, `eth_getLogs`, `getSlot`).
- **Zero Live Exchange Order Endpoints:** Market telemetry is ingested exclusively from unauthenticated, read-only public REST endpoints across Coinbase Exchange, Kraken, Hyperliquid, and DexScreener. Automated test #10 (`tests/engine.test.ts`) statically scans `src/lib/` on every test run to verify that no order-placement routes or wallet key patterns exist.

## 2. Cryptographic Audit-Notary Key Isolation

Every reasoning-trail block produced by Frimin is signed with a dedicated local `Ed25519` audit-notary keypair (`src/lib/crypto-trail.ts`) solely to establish tamper-evident provenance of historical agent decisions:

- Private signing material is isolated inside `data/.notary-private.pem` with POSIX `0600` file permissions and excluded from Git via `.gitignore`.
- Public verification metadata is written separately to `data/frimin-audit-notary.pub.json`, and the raw 32-byte public key (`signerPublicKey`) is embedded in each trail record so any third party can verify chain integrity independently via `npm run verify`.

## 3. Reporting Vulnerabilities

If you identify a security, cryptographic-verification, or data-sanitization issue in this repository, please open a detailed report via GitHub Issues or GitHub Security Advisories on `AbdullahBalfaqih/Frimin`.
