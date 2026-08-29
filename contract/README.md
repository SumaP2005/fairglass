# Compact fairness-policy contract

Owner: Lastos

## Setup

1. Clone the official Midnight starter kit (link in the Discord / hackathon
   resources) into this folder, or follow its instructions to scaffold here.
2. Run the local Midnight proof server (`midnight-proof-server` or whatever
   the starter kit provides) and keep it running all weekend.
3. Write the policy contract in `policy.compact` (see skeleton below).

## Policy schema (locked Friday night, do not change without telling everyone)

- **Allowed attributes:** `skills`, `experience_years`
- **Forbidden attributes:** `name`, `age`, `gender`

## Contract responsibilities

1. Store the policy hash on-chain.
2. Verify a submitted zero-knowledge proof that a decision was derived only
   from allowed attributes.
3. Emit a `FairnessReceipt` event containing policy hash, decision and
   timestamp, and nothing else. No candidate data.
4. Reject proofs that used a forbidden attribute (this is the biased-model
   demo moment).

## Files (to be added during the hackathon)

- `policy.compact` holds the actual Compact contract source
- `deploy.md` holds notes on the testnet deployment, including the contract address
