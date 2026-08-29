/*
 * Smoke test for the proof bridge. Spawns prove.js the same way the Flask
 * service does, so it proves the real path rather than a shell pipeline.
 *
 * Run it with:  npm run smoke
 *
 * Deliberately does not use shell echo. Quoting rules differ between Git Bash,
 * cmd and PowerShell, which made the previous version pass on one machine and
 * silently do nothing on another.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const PROVE = join(here, "prove.js");

const failures = [];

function check(label, ok, detail = "") {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail ? `  ->  ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

function runBridge(payload) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PROVE]);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

console.log("=".repeat(66));
console.log("FairGlass proof bridge smoke test");
console.log("=".repeat(66));

// Compliant decision: must succeed and return a receipt.
const ok = await runBridge({
  policyHash: "0xtest",
  decision: true,
  candidateMetrics: {
    idCommitment: "0xdeadbeef",
    skillsScore: 3,
    experienceYears: 3,
    usedForbiddenData: false,
  },
});
console.log("\ncompliant ->", ok.out || "(no output)");
check("compliant call exits 0", ok.code === 0, `exit ${ok.code}`);
let parsed = null;
try {
  parsed = JSON.parse(ok.out);
} catch {
  /* handled by the next check */
}
check("compliant call returns JSON", parsed !== null);
check("compliant call verifies", parsed?.verified === true);
check("compliant call returns a receipt id", Boolean(parsed?.receiptId), parsed?.receiptId ?? "missing");

// Policy violation: must fail closed, with the reason on stderr and nothing on stdout.
const bad = await runBridge({
  policyHash: "0xtest",
  decision: true,
  candidateMetrics: {
    idCommitment: "0xdeadbeef",
    skillsScore: 0,
    experienceYears: 3,
    usedForbiddenData: true,
  },
});
console.log("\nviolation ->", bad.err || "(no stderr)");
check("violation exits non-zero", bad.code !== 0, `exit ${bad.code}`);
check("violation names the bias gate", bad.err.includes("BIAS DETECTED"));
check("violation writes nothing to stdout", bad.out === "", bad.out || "(empty)");

// Malformed input must not be treated as a pass.
const junk = await new Promise((resolve) => {
  const child = spawn(process.execPath, [PROVE]);
  let out = "", err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  child.stdin.write("not json at all");
  child.stdin.end();
});
check("malformed input fails closed", junk.code !== 0 && junk.out === "", `exit ${junk.code}`);

// A payload missing the witness must be refused, not proven with empty metrics.
const noMetrics = await runBridge({ policyHash: "0xtest", decision: true });
check("missing candidateMetrics is refused",
      noMetrics.code !== 0 && noMetrics.err.includes("candidateMetrics"),
      noMetrics.err || `exit ${noMetrics.code}`);

console.log("\n" + "=".repeat(66));
if (failures.length) {
  console.log(`${failures.length} FAILED: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("All checks passed.");
