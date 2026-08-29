# Proof bridge

Owner: Donalsien (interface, plumbing) and Lastos (the contract calls).

`prove.js` is the only place Node and the Midnight SDK are used. The Flask
service spawns it when `MOCK_PROOF=0`, so the Python side never has to know
anything about the chain.

## Interface, locked

```
stdin   {"policyHash":"0x...","decision":true,"usedForbiddenData":false}
stdout  {"verified":true,"receiptId":"0x...","txHash":"0x..."}
```

A policy violation exits 1 with the reason on stderr. Whatever lands on stderr
is shown to the user as the rejection reason, so keep it readable.

## Install

```bash
cd contract/bridge
npm install
```

Roughly 250 MB in `node_modules`, which is gitignored. `package-lock.json` is
committed, so everyone resolves the same versions.

## Test without any Midnight setup

```bash
npm run smoke
```

Nine checks covering the compliant path, the bias rejection, and malformed
input. It spawns `prove.js` the same way the Flask service does rather than
piping through the shell, because quoting rules differ between Git Bash, cmd
and PowerShell and a shell pipeline passed on one machine while silently doing
nothing on another.

## What Lastos still needs to supply

1. The deployed contract address.
2. The compiled contract output directory, which `NodeZkConfigProvider` needs.
   This comes out of the Compact compiler and is not in the repo yet.
3. Which network we target: `undeployed` for a fully local stack, or a public
   testnet. See the note below, this is a team decision.

## Endpoints the bridge will need

| Service | Local stack | Notes |
|---|---|---|
| Proof server | `http://127.0.0.1:6300` | Always runs locally. Witness data must never leave the machine. |
| Indexer | `http://127.0.0.1:8088/api/v4/graphql` | Public testnet has a hosted one. |
| Node RPC | `ws://127.0.0.1:9944` | Public testnet has a hosted one. |

Running the full local stack means three containers and a locally deployed
contract that only exists on one laptop. Pointing at a public testnet means
only the proof server runs locally, Lastos deploys once, and everyone shares
one contract address. For a five person team split across timezones the
testnet route is far less fragile.
