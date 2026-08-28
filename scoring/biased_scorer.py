"""
Biased scorer — INTENTIONALLY uses a forbidden attribute (age) so the
Compact contract has something real to reject on-chain during the demo.
Owner: sumap

This file must never be the "fair" path — it exists only to prove the
contract enforces the policy.
"""


def score_candidate(candidate):
    """Intentionally violates policy by using 'age' in the decision."""
    age = candidate.get("age", 0)
    # Forbidden: rejecting/favoring based on age
    return age < 40


def score_candidates(candidates):
    results = []
    for c in candidates:
        decision = score_candidate(c)
        results.append({
            "id": c["id"],
            "decision": "shortlist" if decision else "reject",
            "used_forbidden_attribute": "age",
        })
    return results
