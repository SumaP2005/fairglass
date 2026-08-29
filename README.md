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

## Setup (run once per laptop, Friday night)

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

Watch candidates `c4` and `c5` across the two runs. `c4` is 51 and well
qualified; the fair model shortlists them and the biased model drops them.
`c5` is 23 and underqualified; the fair model drops them and the biased model
shortlists them. Nothing but age changed the outcome, and that is exactly what
the contract refuses to certify.

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

All seed data in `data/` must be synthetic. No real names, no real resumes.

## AI tool disclosure

Per MLH rules, the team discloses use of AI coding assistants (including
Claude Code) during the hackathon. All architecture and integration decisions
were made by the team.
