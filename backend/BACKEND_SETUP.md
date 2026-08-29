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
| GET | `/health` | Liveness check: proof mode, proof server address, and whether it is reachable |

The `/screen` body is optional. Send `{"required_skills": ["java", "aws"]}` to
screen for a different role. Skills and experience are allowed attributes, so
changing the role cannot make a decision unfair and the proof still verifies.

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
