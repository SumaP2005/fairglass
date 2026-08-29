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
