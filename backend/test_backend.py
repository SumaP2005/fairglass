"""
Smoke test for the FairGlass backend. No server needed, no extra packages.

Run it from the backend/ folder:
    Windows:      venv\\Scripts\\python test_backend.py
    Linux / Mac:  python test_backend.py

Every check prints PASS or FAIL and the script exits non-zero if anything failed,
so it also works as a pre-push check.
"""

import json

from app import app, POLICY_HASH

failures = []


def check(label, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}" + (f"  ->  {detail}" if detail else ""))
    if not condition:
        failures.append(label)


client = app.test_client()

print("=" * 70)
print("FairGlass backend smoke test")
print("=" * 70)
print(f"\nPolicy hash: {POLICY_HASH}\n")

# --- Fair model: must produce a verified receipt --------------------------
fair = client.post("/screen?model=fair").get_json()
receipt = fair["receipt"]
print("Fair receipt:", json.dumps(receipt, indent=2))
check("fair model verifies", receipt["verified"] is True)
check("fair receipt has an id", "receiptId" in receipt, receipt.get("receiptId", "missing"))
check("fair decisions carry no forbidden tag",
      all("used_forbidden_attribute" not in d for d in fair["decisions"]))

# --- Biased model: must be rejected, no receipt issued --------------------
biased = client.post("/screen?model=biased").get_json()
receipt = biased["receipt"]
print("\nBiased receipt:", json.dumps(receipt, indent=2))
check("biased model is rejected", receipt["verified"] is False)
check("rejection carries a reason", "reason" in receipt, receipt.get("reason", "missing"))
check("no receipt issued on rejection", "receiptId" not in receipt)

# --- The demo moment: same candidate, opposite outcomes -------------------
fair_by_id = {d["id"]: d["decision"] for d in fair["decisions"]}
biased_by_id = {d["id"]: d["decision"] for d in biased["decisions"]}
print(f"\nc4 (age 51, qualified):   fair={fair_by_id['c4']}  biased={biased_by_id['c4']}")
print(f"c5 (age 23, unqualified): fair={fair_by_id['c5']}  biased={biased_by_id['c5']}")
check("c4 shortlisted by fair but rejected by biased",
      fair_by_id["c4"] == "shortlist" and biased_by_id["c4"] == "reject")
check("c5 rejected by fair but shortlisted by biased",
      fair_by_id["c5"] == "reject" and biased_by_id["c5"] == "shortlist")

# --- Role is configurable: same policy, different job ---------------------
java_role = client.post("/screen?model=fair",
                        json={"required_skills": ["java", "spring boot", "aws"]}).get_json()
java_by_id = {d["id"]: d["decision"] for d in java_role["decisions"]}
print()
print(f"Java role -> c6 (java/spring/aws, 12 yrs): {java_by_id['c6']}"
      f"  |  c1 (python/react/sql): {java_by_id['c1']}")
check("custom role is echoed back", java_role["requiredSkills"] == ["java", "spring boot", "aws"])
check("java role shortlists c6", java_by_id["c6"] == "shortlist")
check("java role rejects c1", java_by_id["c1"] == "reject")
check("changing the role still verifies", java_role["receipt"]["verified"] is True)
check("bad required_skills returns 400",
      client.post("/screen?model=fair", json={"required_skills": "python"}).status_code == 400)

# --- Witness payload must match the contract's getCandidateMetrics --------
import app as _app
w = _app.witness_payload(fair["decisions"])
print()
print(f"witness sent to the contract: {json.dumps(w)}")
check("witness has all four contract fields",
      set(w) == {"idCommitment", "skillsScore", "experienceYears", "usedForbiddenData"},
      str(sorted(w)))
check("witness idCommitment is 32 bytes hex",
      len(w["idCommitment"]) == 66 and w["idCommitment"].startswith("0x"))
check("skillsScore is an int", isinstance(w["skillsScore"], int))
check("experienceYears is an int", isinstance(w["experienceYears"], int))
check("fair witness is not flagged", w["usedForbiddenData"] is False)

wb = _app.witness_payload(biased["decisions"])
check("biased witness is flagged", wb["usedForbiddenData"] is True)

# --- Which candidate gets proven is selectable, not fixed -----------------
for target in ("c4", "c8"):
    picked = client.post("/screen?model=fair", json={"candidate_id": target}).get_json()
    check(f"can prove {target} on request",
          picked["receipt"]["provenCandidate"] == target,
          picked["receipt"]["provenCandidate"])

# c8 has none of the required skills, so the decision is reject. The proof
# still verifies: it attests the policy was followed, not that anyone was hired.
c8 = client.post("/screen?model=fair", json={"candidate_id": "c8"}).get_json()
c8_decision = next(d for d in c8["decisions"] if d["id"] == "c8")["decision"]
check("a rejected candidate still produces a valid proof",
      c8_decision == "reject" and c8["receipt"]["verified"] is True,
      f"decision={c8_decision} verified={c8['receipt']['verified']}")

check("unknown candidate_id returns 404",
      client.post("/screen?model=fair", json={"candidate_id": "nope"}).status_code == 404)
check("non-string candidate_id returns 400",
      client.post("/screen?model=fair", json={"candidate_id": 7}).status_code == 400)

# --- Commitment scheme: hiding and binding --------------------------------
# idCommitment is the receipt key on a public ledger. These are the properties
# the privacy claim rests on, so they are asserted, not assumed.
import hashlib as _h

naive = "0x" + _h.sha256(b"c1").hexdigest()
c_a, n_a = _app.commit_to_id("c1")
c_b, n_b = _app.commit_to_id("c1")

check("commitment is not a bare hash of the id", c_a != naive)
check("commitment is 32 bytes", len(c_a) == 66 and c_a.startswith("0x"))
check("nonce is 32 bytes", len(n_a) == 66)
check("HIDING: same candidate is unlinkable across receipts", c_a != c_b,
      "two screenings of c1 produce different commitments")
check("nonces differ per receipt", n_a != n_b)
check("commitment opens with the right nonce", _app.open_commitment(c_a, n_a, "c1"))
check("BINDING: wrong candidate does not open it",
      not _app.open_commitment(c_a, n_a, "c2"))
check("wrong nonce does not open it", not _app.open_commitment(c_a, n_b, "c1"))
check("garbage nonce is rejected, not crashed",
      not _app.open_commitment(c_a, "not-hex", "c1"))

# Brute force is the attack that matters: an observer knows ids look like c1..c10.
brute = any(_app.commit_to_id(f"c{i}", nonce="0x" + "00" * 32)[0] == c_a
            for i in range(1, 11))
check("brute forcing ids without the nonce fails", not brute)

# --- The disclosure report must not contradict itself ---------------------
disc = fair["disclosure"]
onchain_values = json.dumps(disc["onChain"])
check("disclosure lists what goes on chain", set(disc["onChain"]) ==
      {"policyHash", "decision", "timestamp", "idCommitment"}, str(sorted(disc["onChain"])))
for forbidden_field in ("name", "age", "gender"):
    check(f"no {forbidden_field} value leaks into the on-chain block",
          forbidden_field not in onchain_values.lower())
check("nonce is never in the on-chain block",
      fair["commitmentNonce"] not in onchain_values)

# --- Opening a commitment over the API ------------------------------------
opened = client.post("/verify-commitment", json={
    "commitment": fair["receipt"]["idCommitment"],
    "nonce": fair["commitmentNonce"],
    "candidateId": fair["receipt"]["provenCandidate"],
}).get_json()
check("API opens a valid commitment", opened["matches"] is True)

wrong = client.post("/verify-commitment", json={
    "commitment": fair["receipt"]["idCommitment"],
    "nonce": fair["commitmentNonce"],
    "candidateId": "c9",
}).get_json()
check("API refuses a false opening", wrong["matches"] is False)
check("verify-commitment validates its input",
      client.post("/verify-commitment", json={"commitment": "0x1"}).status_code == 400)

check("receipt names the proven candidate", fair["receipt"].get("provenCandidate") is not None,
      fair["receipt"].get("provenCandidate"))

# --- The API must not leak forbidden attributes ---------------------------
first = client.get("/candidates").get_json()[0]
print(f"\n/candidates first row: {json.dumps(first)}")
leaked = [f for f in ("name", "age", "gender") if f in first]
check("/candidates hides forbidden attributes", not leaked, f"leaked: {leaked}" if leaked else "")

# --- Housekeeping ---------------------------------------------------------
check("policy hash is stable across calls",
      client.get("/policy").get_json()["policyHash"] == POLICY_HASH)
check("bad model name returns 400", client.post("/screen?model=nonsense").status_code == 400)
health = client.get("/health").get_json()
print()
print(f"health: {json.dumps(health)}")
check("health endpoint reports mode", health["proofMode"] in ("mock", "real"))
check("health reports the proof server address", "proofServerUrl" in health)
check("health reports proof server reachability", "proofServer" in health,
      health.get("proofServer", "missing"))

# The check must degrade gracefully, not raise, when nothing is listening.
import app as app_module
_saved = app_module.PROOF_SERVER_URL
app_module.PROOF_SERVER_URL = "http://localhost:59999"
down = app_module.proof_server_status(timeout=1.0)
app_module.PROOF_SERVER_URL = _saved
print(f"unreachable proof server reports: {down}")
check("unreachable proof server reports down", down.startswith("down"))
check("health still returns 200 when proof server is down",
      client.get("/health").status_code == 200)

# --- CORS: the frontend runs on a different port than this service --------
cors = client.post("/screen?model=fair", headers={"Origin": "http://localhost:8080"})
check("CORS allows the frontend origin",
      cors.headers.get("Access-Control-Allow-Origin") == "http://localhost:8080",
      cors.headers.get("Access-Control-Allow-Origin", "no header"))

print("\n" + "=" * 70)
if failures:
    print(f"{len(failures)} FAILED: " + ", ".join(failures))
    raise SystemExit(1)
print("All checks passed.")
