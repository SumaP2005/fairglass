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
import hmac
import json
import os
import secrets
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

# Address of the deployed FairGlass contract. Empty until Lastos deploys.
# Handed to the bridge the same way PROOF_SERVER_URL is, so the address lives
# in one place rather than being hardcoded in prove.js.
CONTRACT_ADDRESS = os.environ.get("CONTRACT_ADDRESS", "").strip()

# The role being hired for. Not part of the fairness policy: these are all
# allowed attributes, so changing them cannot make a decision unfair.
DEFAULT_REQUIRED_SKILLS = ["python", "react", "sql"]
BIAS_REASON = "BIAS DETECTED: Forbidden attributes (name, age, gender) were used"

# Salt for the candidate id commitment. The contract stores idCommitment as the
# the receipt key on a public ledger, so it must not be reversible to a
# candidate id by anyone reading the chain. Domain separation only; the hiding
# property comes from the per-receipt nonce, not from this string.
COMMITMENT_DOMAIN = os.environ.get("COMMITMENT_DOMAIN", "fairglass/id-commitment/v1")

# Field separator for the commitment preimage. Domain, nonce and id are joined
# with a byte that cannot appear in any of them, so no two different inputs can
# produce the same preimage by shifting where one field ends.
SEP = bytes([0])


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


def commit_to_id(candidate_id, nonce=None):
    """Hash commitment to a candidate id. Returns (commitment, nonce), both hex.

    commitment = SHA256(domain || nonce || candidate_id)

    The nonce is 32 fresh random bytes per receipt. That is what makes this a
    commitment rather than a lookup key:

      hiding   an observer holding only the commitment learns nothing about the
               id. Brute forcing "c1".."c10" fails because they would also have
               to guess 256 bits of nonce. Two receipts for the same candidate
               are unlinkable, so the chain cannot be mined for "how often was
               this person screened".
      binding  SHA256 collision resistance means the committer cannot later
               claim the commitment was to a different candidate.

    The nonce is the opening. Whoever holds it can prove what the commitment
    refers to; whoever does not, cannot. It is returned to the caller and never
    written on chain.
    """
    nonce_bytes = secrets.token_bytes(32) if nonce is None else bytes.fromhex(
        nonce[2:] if nonce.startswith("0x") else nonce
    )
    digest = hashlib.sha256(
        COMMITMENT_DOMAIN.encode() + SEP + nonce_bytes + SEP + candidate_id.encode()
    ).hexdigest()
    return "0x" + digest, "0x" + nonce_bytes.hex()


def open_commitment(commitment, nonce, candidate_id):
    """Check that (nonce, candidate_id) opens to commitment.

    Constant time compare so a caller cannot time their way to a valid opening.
    """
    try:
        recomputed, _ = commit_to_id(candidate_id, nonce)
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(recomputed, commitment)


def proof_subject(decisions, candidate_id=None):
    """Pick the one candidate the proof is generated for.

    The contract proves a single decision per call: submitDecision takes one
    boolean and the receipts ledger is keyed by one idCommitment. Proving all
    ten would mean ten real proofs and a demo that stalls.

    Pass candidate_id to prove a specific candidate. Without it we fall back to
    the first shortlisted one, and then to the first candidate if the model
    shortlisted nobody.
    """
    if not decisions:
        return None
    if candidate_id is not None:
        for d in decisions:
            if d["id"] == candidate_id:
                return d
        return None
    for d in decisions:
        if d["decision"] == "shortlist":
            return d
    return decisions[0]


def witness_payload(decisions, commitment=None, candidate_id=None):
    """Build exactly what the contract's getCandidateMetrics witness expects.

    Field names and types mirror the generated index.d.ts:
      idCommitment      Bytes<32>   hex string, converted to bytes in prove.js
      skillsScore       Uint<32>
      experienceYears   Uint<32>
      usedForbiddenData Boolean

    Everything here is witness data. It goes to the LOCAL proof server and is
    consumed inside the circuit. None of it is written to the ledger.
    """
    subject = proof_subject(decisions, candidate_id)
    if subject is None:
        return None
    if commitment is None:
        commitment, _ = commit_to_id(subject["id"])
    return {
        "idCommitment": commitment,
        "skillsScore": int(subject.get("skills_score", 0)),
        "experienceYears": int(subject.get("experience_years", 0)),
        "usedForbiddenData": "used_forbidden_attribute" in subject,
    }


def used_forbidden_data(decisions):
    # The biased scorer tags its output; the fair scorer never does.
    return any("used_forbidden_attribute" in d for d in decisions)


def receipt_id(decisions, ts):
    payload = json.dumps(decisions, sort_keys=True) + str(ts)
    return "0x" + hashlib.sha256(payload.encode()).hexdigest()[:16]


def mock_proof(model, decisions, commitment=None, candidate_id=None):
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
    subject = proof_subject(decisions, candidate_id)
    return {
        "verified": True,
        "policyHash": POLICY_HASH,
        "model": model,
        "proofMode": "mock",
        "receiptId": receipt_id(decisions, ts),
        "provenCandidate": subject["id"] if subject else None,
        "idCommitment": commitment,
        "timestamp": ts,
    }


def real_proof(model, decisions, commitment=None, candidate_id=None):
    """Bridge to Midnight: prove.js reads JSON on stdin, prints JSON on stdout.

    Contract with Lastos:
      in:  {policyHash, decision, candidateMetrics}
      out: {verified, receiptId, txHash, reason?}
    A failed circuit assert (bias gate) exits non-zero with the reason on stderr.
    """
    subject = proof_subject(decisions, candidate_id)
    payload = {
        "policyHash": POLICY_HASH,
        "decision": bool(subject and subject["decision"] == "shortlist"),
        "candidateMetrics": witness_payload(decisions, commitment, candidate_id),
    }
    ts = int(time.time())
    if not CONTRACT_ADDRESS:
        return {
            "verified": False,
            "policyHash": POLICY_HASH,
            "model": model,
            "proofMode": "real",
            "reason": (
                "CONTRACT_ADDRESS is not set. Deploy the contract and set it, "
                "or run without MOCK_PROOF=0 to use mock mode."
            ),
            "timestamp": ts,
        }
    try:
        result = subprocess.run(
            ["node", BRIDGE_PATH],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=180,
            env={
                **os.environ,
                "PROOF_SERVER_URL": PROOF_SERVER_URL,
                "CONTRACT_ADDRESS": CONTRACT_ADDRESS,
            },
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


def disclosure_report(receipt, decisions):
    """Spell out what goes public and what stays here.

    "Show proof not data" is only a claim until you can point at the two lists.
    Every field under onChain is in the contract's FairnessReceipt or is its
    ledger key. Everything under staysLocal is witness data consumed inside the
    circuit on this machine, or is never sent anywhere at all.
    """
    return {
        "onChain": {
            "policyHash": receipt.get("policyHash"),
            "decision": receipt.get("verified"),
            "timestamp": receipt.get("timestamp"),
            "idCommitment": receipt.get("idCommitment"),
        },
        "staysLocal": {
            "candidateCount": len(decisions),
            "witnessFields": ["skillsScore", "experienceYears", "usedForbiddenData"],
            "neverTransmitted": POLICY["forbidden"] + ["commitment nonce"],
            "note": (
                "Witness data reaches the proof server on this machine only. "
                "The forbidden attributes are never read by the fair scorer, "
                "never sent to the proof server, and never written on chain."
            ),
        },
    }


@app.route("/verify-commitment", methods=["POST"])
def verify_commitment():
    """Open a commitment: prove which candidate a public receipt key refers to.

    This is the other half of the privacy claim. Anyone can read idCommitment
    off the ledger and learn nothing. Whoever holds the nonce can prove it
    refers to a specific candidate, and cannot lie about which one.
    """
    body = request.get_json(silent=True) or {}
    missing = [k for k in ("commitment", "nonce", "candidateId") if not body.get(k)]
    if missing:
        return jsonify({"error": f"missing: {', '.join(missing)}"}), 400

    matches = open_commitment(body["commitment"], body["nonce"], body["candidateId"])
    return jsonify({
        "matches": matches,
        "candidateId": body["candidateId"],
        "explanation": (
            "The nonce opens this commitment to that candidate."
            if matches
            else "This nonce and candidate do not open that commitment."
        ),
    })


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

    candidate_id = body.get("candidate_id")
    if candidate_id is not None and not isinstance(candidate_id, str):
        return jsonify({"error": "candidate_id must be a string"}), 400

    candidates = load_candidates()
    decisions = run_scorer(model, candidates, required_skills)

    subject = proof_subject(decisions, candidate_id)
    if subject is None and candidate_id is not None:
        return jsonify({"error": f"unknown candidate_id: {candidate_id}"}), 404

    # One fresh commitment per screening. The nonce goes back to the caller and
    # nowhere else, so the caller is the only party who can ever open it.
    commitment, nonce = commit_to_id(subject["id"]) if subject else (None, None)

    receipt = (mock_proof(model, decisions, commitment, candidate_id) if MOCK_PROOF
               else real_proof(model, decisions, commitment, candidate_id))

    return jsonify({
        "model": model,
        "requiredSkills": required_skills,
        "decisions": decisions,
        "receipt": receipt,
        "commitmentNonce": nonce,
        "disclosure": disclosure_report(receipt, decisions),
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
        "contractAddress": CONTRACT_ADDRESS or None,
        "contractDeployed": bool(CONTRACT_ADDRESS),
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
