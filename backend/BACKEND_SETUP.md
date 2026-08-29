# Backend setup (FairGlass Flask service)

Owner: Donalsien (KADHACK). Ask in the team channel if anything here fails.

## 1. Create the virtual environment and install

From the repo root:

**Windows (PowerShell or Git Bash):**
```
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt
```

**Linux / Mac:**
```
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 2. Run the service

**Windows:**
```
venv\Scripts\python app.py
```

**Linux / Mac (venv active):**
```
python app.py
```

Service listens on http://localhost:5000. Leave it running; the frontend
(frontend/index.html) calls it directly.

## 3. Proof modes

The proof step is controlled by the MOCK_PROOF environment variable.

| Mode | How | What happens |
|---|---|---|
| Mock (default) | just run `python app.py` | Policy gate simulated locally, instant receipt. Frontend fully works with no Midnight setup. |
| Real | set `MOCK_PROOF=0` before running | Backend shells out to `contract/bridge/prove.js`, which calls the Midnight proof server and the deployed contract. Needs Node plus the bridge (Lastos + Donalsien, Stage 6). |

Windows: `set MOCK_PROOF=0` (cmd) or `$env:MOCK_PROOF="0"` (PowerShell).
Linux/Mac: `MOCK_PROOF=0 python app.py`.

`PROOF_SERVER_URL` sets where the proof server lives, default
`http://localhost:6300`. The backend uses it for the health check and passes it
down to the bridge, so if Lastos hosts the proof server instead of each of us
running one, that variable is the only thing that changes.

Start the proof server with Docker:

```
docker run --name fairglass-proof -p 6300:6300 midnightnetwork/proof-server -- midnight-proof-server --network testnet
```

First run downloads the zero-knowledge parameters, which takes a while. After
that, reuse the same container with `docker start fairglass-proof` rather than
`docker run`, which would build a new one and fetch the parameters again.

Both modes enforce the same rule: a biased decision must not verify.

## 4. Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/screen?model=fair` or `?model=biased` | Run the full pipeline, return decisions + receipt |
| GET | `/policy` | The locked policy and its hash |
| GET | `/candidates` | Candidate pool, allowed attributes only |
| POST | `/verify-commitment` | Open a receipt's `idCommitment` and prove which candidate it refers to |
| GET | `/health` | Liveness check: proof mode, proof server address, and whether it is reachable |

The `/screen` body is optional. Send `{"required_skills": ["java", "aws"]}` to
screen for a different role. Skills and experience are allowed attributes, so
changing the role cannot make a decision unfair and the proof still verifies.

### Privacy model, worth understanding before changing anything

`idCommitment` is the key the contract writes into its public `receipts`
ledger. It is `SHA256(domain || nonce || candidateId)` with **32 fresh random
bytes of nonce per receipt**. Two consequences:

- **Hiding.** An observer with only the commitment learns nothing. They cannot
  brute force `c1`..`c10` because they would also have to guess 256 bits of
  nonce. Two screenings of the same candidate produce unrelated commitments, so
  the ledger cannot be mined for how often someone was screened.
- **Binding.** SHA256 collision resistance means whoever committed cannot later
  claim it referred to a different candidate.

The nonce is the **opening**. It is returned to the caller as
`commitmentNonce`, is never written on chain, and is never sent to the proof
server. Whoever holds it can prove what a receipt refers to via
`/verify-commitment`; whoever does not, cannot. Do not log it, do not persist
it, do not put it in the disclosure block. There is a test asserting it never
appears in the on-chain block.

Every `/screen` response also carries a `disclosure` object stating exactly
what goes public and what stays on the machine. That is the "show proof not
data" claim made checkable rather than asserted.

### /screen response shape (agreed with Eman, do not break)

```json
{
  "model": "fair",
  "decisions": [
    {"id": "c1", "decision": "shortlist"}
  ],
  "receipt": {
    "verified": true,
    "policyHash": "0x...",
    "model": "fair",
    "proofMode": "mock",
    "receiptId": "0x...",
    "timestamp": 1724880000
  }
}
```

On a policy violation (biased model), `verified` is `false` and a `reason`
field carries the contract's rejection message. `receiptId` is absent because
no receipt is issued for a rejected proof.

## 5. Quick test without the frontend

```
curl -X POST "http://localhost:5000/screen?model=fair"
curl -X POST "http://localhost:5000/screen?model=biased"
curl http://localhost:5000/health
```

The fair call must return `"verified": true`, the biased call
`"verified": false` with the bias reason. If both do, the backend is good.
