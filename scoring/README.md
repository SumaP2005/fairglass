# Scoring engine (simulated AI model)

Owner: sumap

- `fair_scorer.py` decides using only allowed attributes: skills and experience.
- `biased_scorer.py` intentionally uses a forbidden attribute, age. It exists only
  to demo the contract rejecting a non-compliant proof.

> Disclosure: both scorers are deterministic Python functions, not a trained
> ML model. The zero-knowledge proof speaks about the policy applied to the
> attributes, not about neural network internals. This substitution is
> disclosed openly in the top-level README and the Devpost submission.
