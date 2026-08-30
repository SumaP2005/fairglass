// FairGlass frontend logic
const API_BASE = "http://localhost:5000";

const resultsEl    = document.getElementById("results");
const receiptEl    = document.getElementById("receipt-output");
const skillsInputEl= document.getElementById("required-skills");
const policyListEl = document.getElementById("policy-list");
const policyHashEl = document.getElementById("policy-hash");
const statusBackendEl = document.getElementById("status-backend");
const statusProofEl   = document.getElementById("status-proof");
const fairBtn   = document.getElementById("run-fair");
const biasedBtn = document.getElementById("run-biased");

// SVG Icons Map
const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  allow: '<svg class="allow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  forbid: '<svg class="forbid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>',
  hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>'
};

function setEmptyResults() {
  resultsEl.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span>Run a model to see candidate decisions.</span>
    </div>`;
}

function setEmptyReceipt() {
  receiptEl.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      <span>No receipt yet.</span>
    </div>`;
}

function parseRequiredSkills() {
  const raw = (skillsInputEl?.value || "").trim();
  if (!raw) return null;
  return raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

function setLoadingButtons(loading) {
  [fairBtn, biasedBtn].forEach(b => {
    if (loading) {
      b.dataset.label = b.innerHTML;
      b.innerHTML = `<span class="spinner"></span>Running…`;
      b.disabled = true;
    } else {
      b.innerHTML = b.dataset.label || b.innerHTML;
      b.disabled = false;
    }
  });
}

async function runScreening(mode) {
  resultsEl.innerHTML = `<span style="opacity:0.7">Running ${mode} model…</span><div class="loading-line"></div>`;
  setLoadingButtons(true);

  const requiredSkills = parseRequiredSkills();
  try {
    const res = await fetch(`${API_BASE}/screen?model=${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requiredSkills ? { required_skills: requiredSkills } : {}),
    });
    const data = await res.json();
    if (!res.ok) {
      resultsEl.innerHTML = `<span style="color:var(--red)">Error: ${data.error || "request failed"}</span>`;
      setEmptyReceipt();
      return;
    }
    renderDecisions(data);
    renderReceipt(data);
  } catch (err) {
    resultsEl.innerHTML = `<span style="color:var(--red)">Error: ${err.message}. Is the backend running?</span>`;
    setEmptyReceipt();
  } finally {
    setLoadingButtons(false);
  }
}

function renderDecisions(data) {
  resultsEl.innerHTML = "";

  const summary = document.createElement("p");
  summary.className = "hint";
  summary.textContent = `Model: ${data.model} | Required skills: ${data.requiredSkills.join(", ")}`;
  resultsEl.appendChild(summary);

  const list = document.createElement("div");
  list.className = "decision-list";

  data.decisions.forEach((d, i) => {
    const row = document.createElement("div");
    row.className = `decision-row decision-${d.decision}`;
    row.style.animationDelay = `${0.05 * i}s`;

    const idSpan = document.createElement("span");
    idSpan.className = "decision-id";
    idSpan.textContent = d.id;

    const badge = document.createElement("span");
    badge.className = "decision-badge";
    
    if (d.decision === "shortlist") {
      badge.innerHTML = `${ICONS.check} Shortlist`;
    } else {
      badge.innerHTML = `${ICONS.cross} Reject`;
    }

    row.appendChild(idSpan);
    row.appendChild(badge);
    list.appendChild(row);
  });

  resultsEl.appendChild(list);
}

async function downloadCertificate(data) {
  const r = data.receipt;
  const certificateNode = receiptEl.querySelector(".certificate");
  const downloadBtn = certificateNode?.querySelector(".certificate-download");
  if (!certificateNode || !downloadBtn) return;

  const originalLabel = downloadBtn.innerHTML;
  downloadBtn.innerHTML = `<span class="spinner"></span>Generating PDF…`;
  downloadBtn.disabled = true;

  try {
    if (typeof html2canvas === "undefined" || !window.jspdf) {
      throw new Error("PDF library did not load — check your internet connection");
    }

    // Screenshot the actual certificate card exactly as it looks on screen.
    // ignoreElements skips the download button itself so it doesn't appear
    // inside the exported PDF.
    const canvas = await html2canvas(receiptEl, {
      scale: 2,
      backgroundColor: "#fffdf7",
      useCORS: true,
      ignoreElements: (el) => el.classList?.contains("certificate-download"),
    });

    const imgData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;

    // Size the PDF page to match the captured image's aspect ratio so the
    // certificate fills the page instead of floating on an A4 sheet.
    const pdfWidthMM = 210;
    const pdfHeightMM = (canvas.height * pdfWidthMM) / canvas.width;

    const pdf = new jsPDF({
      orientation: pdfHeightMM > pdfWidthMM ? "portrait" : "landscape",
      unit: "mm",
      format: [pdfWidthMM, pdfHeightMM],
    });

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidthMM, pdfHeightMM);
    pdf.save(`fairglass-receipt-${r.receiptId || "unverified"}.pdf`);
  } catch (err) {
    alert(`Could not generate PDF: ${err.message}`);
  } finally {
    downloadBtn.innerHTML = originalLabel;
    downloadBtn.disabled = false;
  }
}

function renderReceipt(data) {
  if (!data.receipt) {
    setEmptyReceipt();
    return;
  }

  const r = data.receipt;
  receiptEl.innerHTML = "";

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
  badge.innerHTML = r.verified ? `${ICONS.check} Verified` : `${ICONS.cross} Rejected`;

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

  fields.forEach(([label, value], i) => {
    const item = document.createElement("div");
    item.className = "certificate-item";
    item.style.animationDelay = `${0.15 + i * 0.06}s`;

    const key = document.createElement("span");
    key.className = "certificate-label";
    key.textContent = label;

    const val = document.createElement("strong");
    val.className = "certificate-value";
    val.textContent = value;

    item.appendChild(key);
    item.appendChild(val);
    info.appendChild(item);
  });

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "certificate-download";
  downloadBtn.innerHTML = `${ICONS.download} Download Certificate (PDF)`;
  downloadBtn.addEventListener("click", () => downloadCertificate(data));

  const seal = document.createElement("div");
  seal.className = "certificate-seal " + (r.verified ? "verified" : "rejected");
  seal.innerHTML = r.verified ? ICONS.check : ICONS.cross;

  certificate.appendChild(header);
  certificate.appendChild(subheading);
  certificate.appendChild(info);
  certificate.appendChild(downloadBtn);
  certificate.appendChild(seal);
  receiptEl.appendChild(certificate);
}

fairBtn.addEventListener("click",   () => runScreening("fair"));
biasedBtn.addEventListener("click", () => runScreening("biased"));

async function loadPolicy() {
  try {
    const res = await fetch(`${API_BASE}/policy`);
    const data = await res.json();
    policyListEl.innerHTML = "";

    const allowed = document.createElement("li");
    allowed.innerHTML = `${ICONS.allow} <span><strong>Allowed:</strong> ${data.policy.allowed.join(", ")}</span>`;
    
    const forbidden = document.createElement("li");
    forbidden.innerHTML = `${ICONS.forbid} <span><strong>Forbidden:</strong> ${data.policy.forbidden.join(", ")}</span>`;

    policyListEl.appendChild(allowed);
    policyListEl.appendChild(forbidden);
    
    policyHashEl.innerHTML = `${ICONS.hash} Policy hash: ${data.policyHash}`;
  } catch (err) {
    policyListEl.innerHTML = "";
    const errLi = document.createElement("li");
    errLi.textContent = "Could not load policy — is the backend running?";
    policyListEl.appendChild(errLi);
  }
}

function setStatus(el, ok, text) {
  el.textContent = text;
  el.className = `status-pill ${ok ? "status-ok" : "status-down"}`;
}

async function pollHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    setStatus(statusBackendEl, true, "Backend: Up");

    const proofUp = data.proofServer === "up";
    const proofText =
      data.proofMode === "mock"
        ? "Proof Server: Mock Mode"
        : `Proof Server: ${proofUp ? "Up" : "Down"} (Real Mode)`;

    setStatus(statusProofEl, data.proofMode === "mock" || proofUp, proofText);
  } catch (err) {
    setStatus(statusBackendEl, false, "Backend: Unreachable");
    setStatus(statusProofEl, false, "Proof Server: Unknown");
  }
}

// Initialize
loadPolicy();
pollHealth();
setInterval(pollHealth, 10000);