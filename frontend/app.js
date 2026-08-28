// FairGlass frontend logic — talks to the Flask backend in /backend
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
  const verified = data.receipt.verified;
  receiptEl.innerHTML = verified
    ? `<span class="status-verified">✓ VERIFIED</span> — policy: ${data.receipt.policyHash}`
    : `<span class="status-rejected">✗ REJECTED</span> — policy violation detected`;
}

document.getElementById("run-fair").addEventListener("click", () => runScreening("fair"));
document.getElementById("run-biased").addEventListener("click", () => runScreening("biased"));
