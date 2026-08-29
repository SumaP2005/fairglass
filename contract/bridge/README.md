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

## Compiler and SDK version conflict, read before wiring the real path

`policy.compact` **compiles cleanly**. Verified locally with compactc 0.34.0:
exit 0, no warnings, and it emits `submitDecision.zkir` plus the TypeScript
contract. The contract source is not the problem.

The problem is version alignment between the compiler and this bridge's
dependencies.

| Piece | Needs `@midnight-ntwrk/compact-runtime` |
|---|---|
| compactc 0.34.0, what `compact update` installs today | 0.19.0 |
| midnight-js 4.1.1, latest stable, what we install here | 0.16.0 |
| midnight-js 5.0.0-beta.7 | 0.19.0-rc.0 |

Compiling with 0.34.0 and calling through midnight-js 4.1.1 means the generated
contract code expects a runtime three minor versions newer than the one the SDK
provides. That fails at runtime, not at install, so it will look like a working
setup until the first real proof.

Two coherent choices, and the team should pick one deliberately:

1. **Pin an older compactc** that targets runtime 0.16.0 and keep the stable
   SDK. Safer, since nothing is a prerelease. Costs a compiler download to find
   the right version, `compact list` shows what is available.
2. **Move the bridge to midnight-js 5.0.0-beta.7** and keep compactc 0.34.0.
   One dependency bump here, but it puts the demo on a beta SDK, and even then
   0.19.0-rc.0 is not identical to the 0.19.0 the compiler targets.

Recommendation is option 1. A hackathon demo should not be the first thing to
run a prerelease chain.

Whichever we pick, **everyone must compile with the same compactc version**.
Pin it in `contract/README.md` once decided.

## What the contract actually exposes

Taken from the generated `index.d.ts`, so this is the real interface, not a
guess. One circuit:

```
submitDecision(decision: boolean) -> []
```

Three witnesses the bridge has to supply:

| Witness | Returns |
|---|---|
| `getInitialPolicyHash` | `Uint8Array`, 32 bytes |
| `getCandidateMetrics` | `{ idCommitment: Uint8Array, skillsScore: bigint, experienceYears: bigint, usedForbiddenData: boolean }` |
| `getCurrentTimestamp` | `bigint` |

**The current bridge payload does not carry enough to fill these.** Today the
Flask service sends `{policyHash, decision, usedForbiddenData}`. The witness
also needs `idCommitment`, `skillsScore` and `experienceYears` per candidate.
Extending the payload is a backend change, Donalsien owns it, and it is small,
but it has to happen before the real path can work.
