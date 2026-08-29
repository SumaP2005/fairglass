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
├── scoring/      # Fair scorer + biased scorer, Python            (sumap)
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

# 3. Frontend: no build step, just open frontend/index.html
#    (or run: python3 -m http.server 8080 --directory frontend)

# 4. Contract: follow the Midnight starter-kit instructions in contract/README.md
```

## Team roles

See `docs/team-plan.md` (or the shared team work plan doc) for the full task
breakdown, critical path, and 48-hour timeline.

| Person | Role | Folder |
|---|---|---|
| Eman | Tech Lead + Frontend | `frontend/` |
| Lastos | Compact Engineer | `contract/` |
| Donalsien (KADHACK) | Integrator / Backend | `backend/` |
| sumap | AI & Data | `scoring/`, `data/` |
| Yashasvi | Docs, Video, Submission | `docs/` |

## Policy (locked Friday night)

- **Allowed attributes:** skills, years of experience
- **Forbidden attributes:** name, age, gender

All seed data in `data/` must be synthetic. No real names, no real resumes.

## AI tool disclosure

Per MLH rules, the team discloses use of AI coding assistants (including
Claude Code) during the hackathon. All architecture and integration decisions
were made by the team.
