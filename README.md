# FairGlass: Proof-of-Fair AI Hiring

Midnight Hackathon: August 2026. MDNT Team (Eman, Lastos, sumap, Donalsien, Yashasvi).

A Compact smart contract on Midnight that cryptographically proves an AI hiring
decision followed an agreed fairness policy, without exposing any candidate data.

> **Note:** The AI scoring model in this repo is **simulated**. A deterministic Python
> function stands in for a real ML model. This is disclosed here on purpose; see
> `scoring/README.md`.

## Folder structure

```
fairglass/
├── frontend/     # Plain HTML/CSS/JS dashboard + receipt page    (Eman, sumap)
├── backend/      # Flask service: runs scorer, calls proof bridge (Donalsien)
├── scoring/      # Fair scorer + biased scorer, Python        (Donalsien)
├── contract/     # Compact policy contract (Midnight starter kit) (Lastos)
├── data/         # Seeded fake candidate data (JSON)              (Yashasvi, sumap)
└── docs/         # README assets, architecture diagram, demo script (Yashasvi)
```

## Setup 
*Run once per laptop, Friday night*

```bash
# 1. Clone
git clone https://github.com/Eman2123/fairglass
cd fairglass

# 2. Backend / scoring (Python). See backend/BACKEND_SETUP.md for Windows steps.
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cd ..

# 3. Frontend: no build step, but it MUST be served over HTTP (see note below)
python3 -m http.server 8080 --directory frontend

# 4. Contract: follow the Midnight starter-kit instructions in contract/README.md
```

> **Do not open `frontend/index.html` directly from the file system.** A page
> loaded over `file://` has a `null` origin, and the browser will block every
> request it makes to the backend. The screen will show a CORS error that looks
> like the backend is down when it is actually fine. Always serve the frontend
> with the command above and browse to `http://localhost:8080`.

## Running the demo

Two terminals:

```bash
# Terminal 1: the backend (from backend/, venv active)
python app.py                 # serves http://localhost:5000

# Terminal 2: the frontend (from the repo root)
python3 -m http.server 8080 --directory frontend
```

Open `http://localhost:8080`, then:

- **Run Fair Model** scores candidates using only skills and experience. The
  policy holds, so the contract issues a fairness receipt.
- **Run Biased Model** scores using age, which the policy forbids. The proof
  fails the contract's bias gate and no receipt is issued.

Watch candidates `c4` and `c5` across the two runs. `c4` is 51 years old and well
qualified; the fair model shortlists them while the biased model rejects them purely because of age.
`c5` is 23 and underqualified; the fair model drops them while the biased model
shortlists them. 
The policy is the same in both runs; only the use of age changes the outcome, which is exactly what the contract refuses to certify.

A rejected candidate can still produce a valid fairness receipt. The proof verifies that the hiring policy was followed, not that the candidate was hired.

To check the backend on its own, run `python test_backend.py` from `backend/`.

## Team roles

See the shared team work plan doc for the full task breakdown, critical path
and 48-hour timeline. Ownership below is the current state, not the original
plan, so trust this table over the doc where they differ.

| Person | Role | Folder |
|---|---|---|
| Eman | Tech Lead + Frontend | `frontend/` |
| Lastos | Compact Engineer | `contract/` |
| Donalsien (KADHACK) | Integrator / Backend | `backend/`, `scoring/`, `contract/bridge/` |
| sumap | Frontend + Data | `frontend/`, `data/` |
| Yashasvi | Docs, Video, Submission | `docs/` |

## Policy (locked Friday night)

- **Allowed attributes:** skills, years of experience
- **Forbidden attributes:** name, age, gender
- **Data requirement:** All seed data in `data/` must be synthetic. No real names, no real resumes.

## Running the demo for judges

[DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md) has the pre-flight checks, the click order, what each
screen proves, what to do if something breaks mid-run, and the answers to the
questions judges are most likely to ask.

## Privacy design: what the ledger actually stores

The principle is simple: **show proof, not data.** Here is how the privacy design supports it.

### The ledger key is a commitment, not an identifier

Every fairness receipt is stored on chain under an `idCommitment`:

```
idCommitment = SHA256( domain || nonce || candidateId )
```

where `nonce` is **32 fresh random bytes generated per receipt**. That nonce is
what turns a lookup key into a commitment, and it buys two properties:

**Hiding.** Someone reading the ledger sees a 32-byte value and learns nothing
from it. They cannot brute force it even knowing the ids look like `c1`..`c10`,
because they would also have to guess 256 bits of nonce. And because the nonce
is fresh each time, two screenings of the same candidate produce completely
unrelated commitments. The chain cannot be mined for "how many times was this
person screened and rejected", which a fixed key would have leaked.

**Binding.** SHA256 collision resistance means whoever created the commitment
cannot later claim it referred to a different candidate.

The nonce is the **opening**. It is returned to the employer who ran the
screening, is never written on chain, and is never sent to the proof server.
Holding it lets you prove which candidate a receipt refers to. Not holding it
means you cannot, and the binding property means the holder cannot lie about it
either.

You can check both properties yourself, see below.

### What crosses which boundary

| Data | Where it goes |
|---|---|
| policy hash, decision, timestamp, id commitment | public ledger |
| skills score, experience years, forbidden-data flag | witness only, consumed by the proof server on the local machine |
| candidate name, age, gender | never read by the fair scorer, never sent anywhere |
| commitment nonce | returned to the employer, never transmitted onward |

The proof server runs locally by design. Witness data never leaves the machine
even when the chain is public. Every `/screen` response carries a `disclosure`
object stating this per request, and the test suite asserts that no forbidden
field and no nonce ever appears in the on-chain block.

### Check it yourself

With the backend and frontend running, open:

```
http://localhost:8080/privacy.html
```

Run a screening twice and compare the commitments: same candidate, unrelated
values, which is hiding. Then try to open the commitment as the real candidate
(it opens) and as any other (it refuses), which is binding.

### Honest limits

The scoring model is a deterministic Python function, not a trained ML model.
The commitment is a hash commitment, which is computationally hiding and
binding under SHA256; it is not a Pedersen commitment and offers no
homomorphic properties, which this design does not need. Seed data is fully
synthetic.

## AI tool disclosure

Per MLH rules, the team discloses use of AI coding assistants (including
Claude Code) during the hackathon. All architecture and integration decisions
were made by the team.
