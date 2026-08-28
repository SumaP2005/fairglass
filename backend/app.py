"""
FairGlass backend service.
Owner: Donalsien (KADHACK)

Responsibilities:
  1. Load seeded candidates from ../data/candidates.json
  2. Run the requested scorer (fair or biased) from ../scoring/
  3. Call the Midnight proof CLI / proof server to generate a ZK proof
  4. Submit the proof to the Compact contract and return the receipt

This file is a skeleton — fill in the TODOs during the hackathon.
"""

import json
import os
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow the plain-HTML frontend to call this during dev

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "candidates.json")


def load_candidates():
    with open(DATA_PATH) as f:
        return json.load(f)


@app.route("/screen", methods=["POST"])
def screen():
    model = request.args.get("model", "fair")  # "fair" or "biased"
    candidates = load_candidates()

    # TODO(sumap): import and call the real scorer from ../scoring/
    # from scoring.fair_scorer import score_candidates
    # from scoring.biased_scorer import score_candidates_biased
    # decisions = score_candidates(candidates) if model == "fair" else score_candidates_biased(candidates)
    decisions = {"placeholder": True, "model": model, "count": len(candidates)}

    # TODO(Lastos/Donalsien): call the proof CLI here and get a real proof
    # proof = generate_proof(decisions)
    # verified = submit_to_contract(proof)
    verified = model == "fair"  # placeholder logic until proof flow is wired

    receipt = {
        "verified": verified,
        "policyHash": "TODO-real-hash-once-contract-deployed",
        "model": model,
    }

    return jsonify({"decisions": decisions, "receipt": receipt})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
