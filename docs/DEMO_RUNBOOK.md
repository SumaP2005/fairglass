# Demo runbook

Owner: Donalsien (KADHACK). Written for whoever drives the demo, whether that
is a live run for judges or the recording session.

Goal: the demo runs hands-free. Nobody types, nobody debugs, nobody says "hold
on". Following this top to bottom takes about four minutes. The video needs
two of them.

---

## 1. Pre-flight, before recording anything

Run these in order. Every check here has caught a real failure during the build.

**Proof server.** Only needed for the real path; mock mode does not use it.

```
docker start fairglass-proof
curl -s http://localhost:6300/health
```

Expect a status of ok. If the container does not exist, see
`backend/BACKEND_SETUP.md`. Do not use `docker run` again, that builds a fresh
container and refetches the zero-knowledge parameters.

**Backend**, from `backend/`:

```
venv\Scripts\python app.py
```

Leave it running. It serves http://localhost:5000.

**Frontend**, from the repo root:

```
python -m http.server 8080 --directory frontend
```

Leave it running. Never open `frontend/index.html` from the file system. A
file:// page has a null origin and the browser blocks every call to the
backend. It looks exactly like the backend is down when it is fine.

**Both test suites**, so you know the build is sound before committing to a take:

```
cd backend && venv\Scripts\python test_backend.py
cd contract/bridge && npm run smoke
```

Expect 56 and 9, both ending "All checks passed."

**Browser setup:**

- Open http://localhost:8080 and http://localhost:8080/privacy.html in two tabs
- Close devtools, close other tabs, hide bookmarks
- Zoom to about 110 percent so text is readable in the recording
- Clear the required-skills box

**Last check before recording:** the two pills in the dashboard header must
read Backend up, plus a proof server state. If the backend pill says
unreachable, either the backend is not running or the page was opened as a file.

---

## 2. The run, in order

### Tab 1, the dashboard

**Beat 1. The policy.** Point at the Fairness Policy panel. Allowed is skills
and experience. Forbidden is name, age and gender. The hash below is the
policy fingerprint, fetched live from the backend rather than typed into the
page, so the screen cannot disagree with what the contract enforces.

**Beat 2. A fair screening.** Click Run Fair Model. Ten candidates come back
with shortlist or reject, and the receipt panel turns green: VERIFIED, with the
policy hash and a receipt id.

Say: the receipt proves the decision followed the policy. It contains no name,
no age, no gender.

**Beat 3. The biased screening.** Click Run Biased Model. The receipt panel
turns red: REJECTED, carrying the message from the contract's bias gate,
"BIAS DETECTED: Forbidden attributes (name, age, gender) were used".

Say: a model that used age cannot get a receipt. The system refuses to certify
it.

**Beat 4. The one that lands.** Compare candidates c4 and c5 across the two
runs. c4 is 51 and well qualified: the fair model shortlists them, the biased
model drops them. c5 is 23 and underqualified: the fair model drops them, the
biased model shortlists them. Nothing but age changed the outcome.

**Beat 5, optional. Different job, same policy.** Type `java, spring boot, aws`
into the required skills box and run the fair model. c6 flips to shortlist, c1
flips to reject, and the proof still verifies. The policy constrains how you
decide, not what you are hiring for.

### Tab 2, the privacy inspector

**Beat 6. Public against private.** Point at the two columns. Red is everything
a stranger reading the ledger sees: policy hash, decision, timestamp, and a
commitment. Green is what never left the machine: the candidate pool, the
witness values, the nonce, and the forbidden attributes.

**Beat 7. Hiding.** Click Run screening twice. The two commitments for the same
candidate are completely different. Say: the ledger key is a commitment with a
fresh 32-byte nonce each time, so nobody can link two receipts or count how
often a person was screened.

**Beat 8. Binding.** In step 4, leave the dropdown on the candidate marked "the
real one" and click. It opens, green. Change it to any other candidate and
click again. It refuses, red.

Say: only the party holding the nonce can prove what a receipt refers to, and
the binding property means they cannot lie about which candidate it was.

---

## 3. If something breaks mid-demo

| Symptom | Cause | Fix |
|---|---|---|
| Backend pill says unreachable | Backend not running, or page opened as a file | Restart `app.py`, browse to http://localhost:8080 not the file |
| Every call errors but the backend is clearly up | CORS, page loaded over file:// | Serve it with `http.server 8080` |
| Fair model rejects all ten | Single-skill role on an old build | Pull latest, the threshold now caps at the number of skills requested |
| Proof server pill shows down in real mode | Container stopped | `docker start fairglass-proof` |
| Real proof path errors | Bridge or contract problem | Restart the backend without `MOCK_PROOF=0`. Mock mode is disclosed in the README and the demo looks identical |
| Inspector shows "Run a screening first" | Backend was down when the page loaded | Reload after the backend is up |

Rule for a live run: if anything fails twice, switch to mock mode and keep
going. A smooth demo of a disclosed simulation beats a broken demo of a real
proof.

---

## 4. Between takes

Nothing persists. Reload both tabs and you are back to a clean state. Clear the
required-skills box if you used beat 5.
