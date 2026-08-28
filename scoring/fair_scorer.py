"""
Fair scorer — decides based ONLY on allowed attributes: skills, experience.
Owner: sumap
"""

ALLOWED_ATTRIBUTES = {"skills", "experience_years"}
MIN_SKILL_MATCH = 2
MIN_EXPERIENCE_YEARS = 1


def score_candidate(candidate, required_skills):
    """Return True (shortlist) or False (reject) using only allowed attributes."""
    skills = set(candidate.get("skills", []))
    experience = candidate.get("experience_years", 0)

    skill_match = len(skills & set(required_skills))
    return skill_match >= MIN_SKILL_MATCH and experience >= MIN_EXPERIENCE_YEARS


def score_candidates(candidates, required_skills=None):
    required_skills = required_skills or ["python", "react", "sql"]
    results = []
    for c in candidates:
        decision = score_candidate(c, required_skills)
        results.append({
            "id": c["id"],
            "decision": "shortlist" if decision else "reject",
        })
    return results


if __name__ == "__main__":
    # quick manual test — TODO(sumap): point this at data/candidates.json
    sample = [{"id": "c1", "skills": ["python", "react"], "experience_years": 2}]
    print(score_candidates(sample))
