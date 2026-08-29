"""
Fair scorer. Decides based ONLY on allowed attributes: skills, experience.
Owner: Donalsien (KADHACK). Taken over from sumap, agreed in the team channel.
"""

ALLOWED_ATTRIBUTES = {"skills", "experience_years"}
MIN_SKILL_MATCH = 2
MIN_EXPERIENCE_YEARS = 1


def required_matches(required_skills):
    """How many skills a candidate must match to clear the bar.

    Capped at the number of skills actually asked for. Screening for a single
    skill used to demand two matches, which no candidate could ever reach, so
    the fair model rejected everyone while the biased model kept shortlisting.
    Anyone typing one skill into the dashboard saw a broken demo.
    """
    return min(MIN_SKILL_MATCH, len(required_skills)) if required_skills else 0


def score_candidate(candidate, required_skills):
    """Return True (shortlist) or False (reject) using only allowed attributes."""
    return score_candidate_detailed(candidate, required_skills)[0]


def score_candidate_detailed(candidate, required_skills):
    """Return (decision, skill_match, experience).

    The contract's getCandidateMetrics witness needs skillsScore and
    experienceYears as numbers, not just the yes/no, so the scorer has to
    hand back what it counted rather than throwing it away.
    """
    skills = set(candidate.get("skills", []))
    experience = candidate.get("experience_years", 0)

    skill_match = len(skills & set(required_skills))
    threshold = required_matches(required_skills)
    decision = skill_match >= threshold and experience >= MIN_EXPERIENCE_YEARS
    return decision, skill_match, experience


def score_candidates(candidates, required_skills=None):
    required_skills = required_skills or ["python", "react", "sql"]
    results = []
    for c in candidates:
        decision, skill_match, experience = score_candidate_detailed(c, required_skills)
        results.append({
            "id": c["id"],
            "decision": "shortlist" if decision else "reject",
            "skills_score": skill_match,
            "experience_years": experience,
        })
    return results


if __name__ == "__main__":
    # quick manual test against a single row; the real check lives in
    # backend/test_backend.py, which runs both scorers over data/candidates.json
    sample = [{"id": "c1", "skills": ["python", "react"], "experience_years": 2}]
    print(score_candidates(sample))
