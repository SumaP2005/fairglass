"""
FairGlass backend service.
Owner: Donalsien (KADHACK)

Pipeline per /screen call:
  candidates -> scorer (fair|biased) -> proof step -> receipt

Proof step modes (MOCK_PROOF env var, defaults to mock):
  MOCK_PROOF=1  simulate the contract's policy gate locally, instant receipt
  MOCK_PROOF=0  shell out to the Node bridge (contract/bridge/prove.js), which
                talks to the Midnight proof server and the deployed contract

Both modes enforce the same rule the Compact circuit enforces on-chain:
a decision derived from a forbidden attribute must NOT verify.
"""

import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(BASE_DIR)
DATA_PATH = os.path.join(REPO_ROOT, "data", "candidates.json")
BRIDGE_PATH = os.path.join(REPO_ROOT, "contract", "bridge", "prove.js")

sys.path.insert(0, REPO_ROOT)
from scoring import fair_scorer, biased_scorer  # noqa: E402

app = Flask(__name__)
CORS(app)

# Single source of truth for the locked policy. The hash is deterministic:
# same policy, same hash, on every machine. The contract stores the same value.
POLICY = {
    "version": "v1",
    "allowed": ["skills", "experience_years"],
    "forbidden": ["name", "age", "gender"],
}
POLICY_HASH = "0x" + hashlib.sha256(
    json.dumps(POLICY, sort_keys=True).encode()
).hexdigest()

MOCK_PROOF = os.environ.get("MOCK_PROOF", "1") == "1"
PROOF_SERVER_URL = os.environ.get("PROOF_SERVER_URL", "http://localhost:6300")

# The role being hired for. Not part of the fairness policy: these are all
# allowed attributes, so changing them cannot make a decision unfair.
DEFAULT_REQUIRED_SKILLS = ["python", "react", "sql"]
BIAS_REASON = "BIAS DETECTED: Forbidden attributes (name, age, gender) were used"


def proof_server_status(timeout=2.0):
    """Report whether the Midnight proof server is reachable.

    Never raises. On Saturday the first question when something breaks will be
    "is the proof server even up", and this is what answers it.
    """
    url = f"{PROOF_SERVER_URL.rstrip('/')}/health"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return "up" if resp.status == 200 else f"unexpected status {resp.status}"
    except urllib.error.URLError as e:
        return f"down ({e.reason})"
    except Exception as e:  # socket timeouts and anything else
        return f"down ({e})"


def load_candidates():
    with open(DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def run_scorer(model, candidates, required_skills):
    if model == "biased":
        # The biased scorer ignores skills entirely, which is the point.
        return biased_scorer.score_candidates(candidates)
    return fair_scorer.score_candidates(candidates, required_skills)


def used_forbidden_data(decisions):
    # The biased scorer tags its output; the fair scorer never does.
    return any("used_forbidden_attribute" in d for d in decisions)


def receipt_id(decisions, ts):
    payload = json.dumps(decisions, sort_keys=True) + str(ts)
    return "0x" + hashlib.sha256(payload.encode()).hexdigest()[:16]


def mock_proof(model, decisions):
    """Local stand-in for the contract's submitDecision circuit."""
    ts = int(time.time())
    if used_forbidden_data(decisions):
        return {
            "verified": False,
            "policyHash": POLICY_HASH,
            "model": model,
            "proofMode": "mock",
            "reason": BIAS_REASON,
            "timestamp": ts,
        }
    return {
        "verified": True,
        "policyHash": POLICY_HASH,
        "model": model,
        "proofMode": "mock",
        "receiptId": receipt_id(decisions, ts),
        "timestamp": ts,
    }


def real_proof(model, decisions):
    """Bridge to Midnight: prove.js reads JSON on stdin, prints JSON on stdout.

    Contract with Lastos:
      in:  {policyHash, decision, usedForbiddenData}
      out: {verified, receiptId, txHash, reason?}
    A failed circuit assert (bias gate) exits non-zero with the reason on stderr.
    """
    payload = {
        "policyHash": POLICY_HASH,
        "decision": any(d["decision"] == "shortlist" for d in decisions),
        "usedForbiddenData": used_forbidden_data(decisions),
    }
    ts = int(time.time())
    try:
        result = subprocess.run(
            ["node", BRIDGE_PATH],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=180,
            env={**os.environ, "PROOF_SERVER_URL": PROOF_SERVER_URL},
        )
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return {
            "verified": False,
            "policyHash": POLICY_HASH,
            "model": model,
            "proofMode": "real",
            "reason": f"proof bridge unavailable: {e}",
            "timestamp": ts,
        }

    if result.returncode != 0:
        return {
            "verified": False,
            "policyHash": POLICY_HASH,
            "model": model,
            "proofMode": "real",
            "reason": result.stderr.strip() or BIAS_REASON,
            "timestamp": ts,
        }

    bridge_out = json.loads(result.stdout)
    bridge_out.update({
        "policyHash": POLICY_HASH,
        "model": model,
        "proofMode": "real",
        "timestamp": ts,
    })
    return bridge_out


@app.route("/screen", methods=["POST"])
def screen():
    model = request.args.get("model", "fair")
    if model not in ("fair", "biased"):
        return jsonify({"error": "model must be 'fair' or 'biased'"}), 400

    body = request.get_json(silent=True) or {}
    required_skills = body.get("required_skills") or DEFAULT_REQUIRED_SKILLS
    if not isinstance(required_skills, list) or not all(
        isinstance(s, str) for s in required_skills
    ):
        return jsonify({"error": "required_skills must be a list of strings"}), 400

    candidates = load_candidates()
    decisions = run_scorer(model, candidates, required_skills)
    receipt = mock_proof(model, decisions) if MOCK_PROOF else real_proof(model, decisions)

    return jsonify({
        "model": model,
        "requiredSkills": required_skills,
        "decisions": decisions,
        "receipt": receipt,
    })


@app.route("/policy", methods=["GET"])
def policy():
    return jsonify({"policy": POLICY, "policyHash": POLICY_HASH})


@app.route("/candidates", methods=["GET"])
def candidates():
    # Expose only id + allowed attributes: the API itself respects the policy.
    safe = [
        {
            "id": c["id"],
            "skills": c.get("skills", []),
            "experience_years": c.get("experience_years", 0),
        }
        for c in load_candidates()
    ]
    return jsonify(safe)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "proofMode": "mock" if MOCK_PROOF else "real",
        "proofServerUrl": PROOF_SERVER_URL,
        "proofServer": proof_server_status(),
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
