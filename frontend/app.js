// FairGlass frontend logic. Talks to the Flask backend in /backend
// TODO(Eman): point this at the deployed backend URL once ready.
const API_BASE = "http://localhost:5000";

const resultsEl = document.getElementById("results");
const receiptEl = document.getElementById("receipt-output");
const skillsInputEl = document.getElementById("required-skills");
const policyListEl = document.getElementById("policy-list");
const policyHashEl = document.getElementById("policy-hash");
const statusBackendEl = document.getElementById("status-backend");
const statusProofEl = document.getElementById("status-proof");

// Parses the comma-separated skills box. Falls back to the backend's own
// default (python/react/sql) when the box is empty, by simply not sending
// required_skills at all.
function parseRequiredSkills() {
  const raw = (skillsInputEl?.value || "").trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function runScreening(mode) {
  resultsEl.textContent = `Running ${mode} model...`;
  const requiredSkills = parseRequiredSkills();

  try {
    const res = await fetch(`${API_BASE}/screen?model=${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requiredSkills ? { required_skills: requiredSkills } : {}),
    });
    const data = await res.json();

    if (!res.ok) {
      resultsEl.textContent = `Error: ${data.error || "request failed"}`;
      return;
    }

    renderDecisions(data);
    renderReceipt(data);
  } catch (err) {
    resultsEl.textContent = `Error: ${err.message}. Is the backend running?`;
  }
}

function renderDecisions(data) {
  resultsEl.textContent = "";

  const summary = document.createElement("p");
  summary.className = "hint";
  summary.textContent = `Model: ${data.model} | Required skills: ${data.requiredSkills.join(", ")}`;
  resultsEl.appendChild(summary);

  const list = document.createElement("div");
  list.className = "decision-list";

  for (const d of data.decisions) {
    const row = document.createElement("div");
    row.className = `decision-row decision-${d.decision}`;

    const idSpan = document.createElement("span");
    idSpan.className = "decision-id";
    idSpan.textContent = d.id;

    const badge = document.createElement("span");
    badge.className = "decision-badge";
    badge.textContent = d.decision === "shortlist" ? "✅ Shortlist" : "❌ Reject";

    row.appendChild(idSpan);
    row.appendChild(badge);
    list.appendChild(row);
  }

  resultsEl.appendChild(list);
}

function renderReceipt(data) {
  if (!data.receipt) {
    receiptEl.textContent = "No receipt returned.";
    return;
  }
  const r = data.receipt;
  receiptEl.textContent = "";

  const badge = document.createElement("span");
  badge.className = r.verified ? "status-verified" : "status-rejected";
  badge.textContent = r.verified ? "✓ VERIFIED" : "✗ REJECTED";
  receiptEl.appendChild(badge);

  // textContent, not innerHTML: a reason string coming back from the contract
  // must never be able to inject markup into the page.
  const lines = r.verified
    ? [`Policy: ${r.policyHash}`, `Receipt: ${r.receiptId}`]
    : [r.reason || "Policy violation detected", `Policy: ${r.policyHash}`];

  for (const line of lines) {
    const div = document.createElement("div");
    div.className = "receipt-line";
    div.textContent = line;
    receiptEl.appendChild(div);
  }
}

document.getElementById("run-fair").addEventListener("click", () => runScreening("fair"));
document.getElementById("run-biased").addEventListener("click", () => runScreening("biased"));

// --- Dynamic policy panel -------------------------------------------------
// Pulls the locked policy from the backend instead of hardcoding it in the
// HTML, so there's one source of truth (backend/app.py's POLICY constant).
async function loadPolicy() {
  try {
    const res = await fetch(`${API_BASE}/policy`);
    const data = await res.json();
    policyListEl.textContent = "";

    const allowed = document.createElement("li");
    allowed.textContent = `Allowed: ${data.policy.allowed.join(", ")}`;
    const forbidden = document.createElement("li");
    forbidden.textContent = `Forbidden: ${data.policy.forbidden.join(", ")}`;

    policyListEl.appendChild(allowed);
    policyListEl.appendChild(forbidden);
    policyHashEl.textContent = `Policy hash: ${data.policyHash}`;
  } catch (err) {
    policyListEl.textContent = "";
    const errLi = document.createElement("li");
    errLi.textContent = "Could not load policy — is the backend running?";
    policyListEl.appendChild(errLi);
  }
}

// --- Status badges ---------------------------------------------------------
// Polls /health so the team can tell, at a glance, whether the backend and
// the proof server are up without opening devtools. Useful when everyone is
// debugging across three timezones over the weekend.
function setStatus(el, ok, text) {
  el.textContent = text;
  el.className = `status-pill ${ok ? "status-ok" : "status-down"}`;
}

async function pollHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    setStatus(statusBackendEl, true, "Backend: ✅ up");

    const proofUp = data.proofServer === "up";
    const modeLabel = data.proofMode === "mock" ? "mock mode" : "real mode";
    setStatus(
      statusProofEl,
      data.proofMode === "mock" || proofUp,
      `Proof server: ${data.proofMode === "mock" ? "🟡" : proofUp ? "✅" : "⚠️"} ${modeLabel}${
        data.proofMode === "real" ? ` (${data.proofServer})` : ""
      }`
    );
  } catch (err) {
    setStatus(statusBackendEl, false, "Backend: ⚠️ unreachable");
    setStatus(statusProofEl, false, "Proof server: unknown");
  }
}

loadPolicy();
pollHealth();
setInterval(pollHealth, 10000); // refresh every 10s, cheap and keeps it honest