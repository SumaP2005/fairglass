// Privacy Inspector: demonstrates the commitment scheme against the live backend.
// Standalone page, does not touch index.html or app.js.

const API_BASE = "http://localhost:5000";

let latest = null;   // most recent screening response
let previous = null; // the one before it, for the hiding comparison

const $ = (id) => document.getElementById(id);

function line(label, value) {
  const d = document.createElement("div");
  d.className = "kv";
  const b = document.createElement("b");
  b.textContent = label;
  d.appendChild(b);
  // textContent throughout: values come from the backend and must never be
  // interpreted as markup.
  d.appendChild(document.createTextNode(value));
  return d;
}

function renderDisclosure(data) {
  const pub = $("public-side");
  const priv = $("private-side");
  pub.textContent = "";
  priv.textContent = "";

  const oc = data.disclosure.onChain;
  pub.appendChild(line("policy hash", oc.policyHash));
  pub.appendChild(line("decision", String(oc.decision)));
  pub.appendChild(line("timestamp", String(oc.timestamp)));
  pub.appendChild(line("id commitment (ledger key)", oc.idCommitment));

  const sl = data.disclosure.staysLocal;
  priv.appendChild(line("candidates screened", String(sl.candidateCount)));
  priv.appendChild(line("commitment nonce (the opening)", data.commitmentNonce));

  const heading = document.createElement("div");
  heading.className = "kv";
  const hb = document.createElement("b");
  hb.textContent = "never transmitted anywhere";
  heading.appendChild(hb);
  const ul = document.createElement("ul");
  ul.className = "hidden-list";
  for (const item of sl.neverTransmitted) {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  }
  heading.appendChild(ul);
  priv.appendChild(heading);
}

function renderHiding() {
  $("curr-commit").textContent = latest ? latest.receipt.idCommitment : "nothing yet";
  $("prev-commit").textContent = previous ? previous.receipt.idCommitment : "run it a second time";

  const v = $("hiding-verdict");
  v.textContent = "";
  if (!previous) return;

  const same = previous.receipt.idCommitment === latest.receipt.idCommitment;
  const badge = document.createElement("div");
  badge.className = `verdict ${same ? "nomatch" : "match"}`;
  badge.textContent = same
    ? "✗ Commitments are identical. Hiding is broken."
    : `✓ Different commitments for the same candidate (${latest.receipt.provenCandidate}). Unlinkable.`;
  v.appendChild(badge);
}

function fillCandidates() {
  const sel = $("candidate");
  sel.textContent = "";
  if (!latest) return;
  for (const d of latest.decisions) {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent =
      d.id === latest.receipt.provenCandidate
        ? `${d.id} (the real one)`
        : d.id;
    sel.appendChild(o);
  }
  sel.value = latest.receipt.provenCandidate;
}

async function loadCandidateList() {
  // Populate the picker from /candidates, which returns allowed attributes
  // only. The page never sees a name, age or gender.
  try {
    const res = await fetch(`${API_BASE}/candidates`);
    const rows = await res.json();
    const sel = $("prove-target");
    for (const r of rows) {
      const o = document.createElement("option");
      o.value = r.id;
      o.textContent = `${r.id} (${r.experience_years}y, ${r.skills.length} skills)`;
      sel.appendChild(o);
    }
  } catch {
    // Backend down. runScreening reports it clearly enough.
  }
}

async function runScreening() {
  $("run-status").textContent = "running...";
  try {
    const chosen = $("prove-target").value;
    const res = await fetch(`${API_BASE}/screen?model=fair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chosen ? { candidate_id: chosen } : {}),
    });
    previous = latest;
    latest = await res.json();
    renderDisclosure(latest);
    renderHiding();
    fillCandidates();
    const subject = latest.decisions.find((d) => d.id === latest.receipt.provenCandidate);
    $("run-status").textContent =
      `done. Proved ${latest.receipt.provenCandidate}, whose decision was "${subject.decision}".`;
    $("verify-verdict").textContent = "";
  } catch (err) {
    $("run-status").textContent = `error: ${err.message}. Is the backend running on port 5000?`;
  }
}

async function verifyCommitment() {
  if (!latest) return;
  const target = $("verify-verdict");
  target.textContent = "checking...";
  try {
    const res = await fetch(`${API_BASE}/verify-commitment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commitment: latest.receipt.idCommitment,
        nonce: latest.commitmentNonce,
        candidateId: $("candidate").value,
      }),
    });
    const data = await res.json();
    target.textContent = "";
    const badge = document.createElement("div");
    badge.className = `verdict ${data.matches ? "match" : "nomatch"}`;
    badge.textContent = data.matches
      ? `✓ Opens to ${data.candidateId}. ${data.explanation}`
      : `✗ Refused for ${data.candidateId}. ${data.explanation}`;
    target.appendChild(badge);
  } catch (err) {
    target.textContent = `error: ${err.message}`;
  }
}

$("run").addEventListener("click", runScreening);
$("verify").addEventListener("click", verifyCommitment);
loadCandidateList();