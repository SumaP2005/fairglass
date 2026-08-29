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

  const certificate = document.createElement("article");
  certificate.className = "certificate";

  const header = document.createElement("div");
  header.className = "certificate-header";

  const titleWrap = document.createElement("div");
  const eyebrow = document.createElement("div");
  eyebrow.className = "certificate-eyebrow";
  eyebrow.textContent = "FairGlass";

  const title = document.createElement("h3");
  title.className = "certificate-title";
  title.textContent = r.verified ? "Certificate of Fair Screening" : "Screening Review Outcome";

  titleWrap.appendChild(eyebrow);
  titleWrap.appendChild(title);

  const badge = document.createElement("span");
  badge.className = r.verified ? "certificate-status verified" : "certificate-status rejected";
  badge.textContent = r.verified ? "Verified" : "Rejected";

  header.appendChild(titleWrap);
  header.appendChild(badge);

  const subheading = document.createElement("p");
  subheading.className = "certificate-subtitle";
  subheading.textContent = r.verified
    ? "This screening result has been attested under the active fairness policy."
    : "This screening result failed verification under the active fairness policy.";

  const info = document.createElement("div");
  info.className = "certificate-grid";

  const fields = [
    ["Model", data.model || "unknown"],
    ["Required skills", (data.requiredSkills || []).join(", ") || "Not provided"],
    ["Receipt ID", r.receiptId || "n/a"],
    ["Policy hash", r.policyHash || "n/a"],
    ["Outcome", r.verified ? "Pass" : "Fail"],
    ["Reason", r.verified ? "Verified against policy" : r.reason || "Policy violation detected"],
  ];

  for (const [label, value] of fields) {
    const item = document.createElement("div");
    item.className = "certificate-item";

    const key = document.createElement("span");
    key.className = "certificate-label";
    key.textContent = label;

    const val = document.createElement("strong");
    val.className = "certificate-value";
    val.textContent = value;

    item.appendChild(key);
    item.appendChild(val);
    info.appendChild(item);
  }

  const seal = document.createElement("div");
  seal.className = "certificate-seal";
  seal.textContent = r.verified ? "✓" : "✕";

  certificate.appendChild(header);
  certificate.appendChild(subheading);
  certificate.appendChild(info);
  certificate.appendChild(seal);
  receiptEl.appendChild(certificate);
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