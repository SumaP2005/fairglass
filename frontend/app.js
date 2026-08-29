// FairGlass frontend logic. Talks to the Flask backend in /backend
// TODO(Eman): point this at the deployed backend URL once ready.
const API_BASE = "http://localhost:5000";

const resultsEl = document.getElementById("results");
const receiptEl = document.getElementById("receipt-output");

async function runScreening(mode) {
  resultsEl.textContent = `Running ${mode} model...`;
  try {
    const res = await fetch(`${API_BASE}/screen?model=${mode}`, { method: "POST" });
    const data = await res.json();
    resultsEl.textContent = JSON.stringify(data, null, 2);
    renderReceipt(data);
  } catch (err) {
    resultsEl.textContent = `Error: ${err.message}. Is the backend running?`;
  }
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
