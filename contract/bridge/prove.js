/*
 * FairGlass proof bridge: Python backend <-> Midnight.
 *
 * The Flask service (backend/app.py) spawns this with `node prove.js` when
 * MOCK_PROOF=0. It is the only place Node and the Midnight SDK are used, so the
 * Python side never has to know anything about the chain.
 *
 * INTERFACE (locked with Donalsien, do not change without telling him):
 *
 *   stdin   {"policyHash":"0x...","decision":true,"usedForbiddenData":false}
 *   stdout  {"verified":true,"receiptId":"0x...","txHash":"0x..."}
 *
 *   On a policy violation: exit code 1, reason on stderr, nothing on stdout.
 *   Anything written to stderr is surfaced to the frontend as the reason.
 *
 * Owner of the TODOs below: Lastos. Everything else is wired and tested.
 */

const BIAS_REASON =
  "BIAS DETECTED: Forbidden attributes (name, age, gender) were used";

// Handed down by backend/app.py so there is one source of truth for the
// address. Falls back to the local default when run standalone.
const PROOF_SERVER_URL =
  process.env.PROOF_SERVER_URL || "http://localhost:6300";

// Set to false once the real submitDecision call below is implemented.
const BRIDGE_IS_STUB = true;

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(buf));
      } catch (e) {
        reject(new Error(`bridge received invalid JSON on stdin: ${e.message}`));
      }
    });
    process.stdin.on("error", reject);
  });
}

function fail(reason) {
  process.stderr.write(reason);
  process.exit(1);
}

async function submitDecision({ policyHash, decision, usedForbiddenData }) {
  // The contract's bias gate is `assert(metrics.usedForbiddenData == false)`.
  // We check it here too so a violating call never even reaches the chain,
  // and so the stub behaves exactly like the real contract will.
  if (usedForbiddenData) {
    fail(BIAS_REASON);
  }

  if (BRIDGE_IS_STUB) {
    // TODO(Lastos): replace this block with the real flow.
    //   1. connect to the proof server at PROOF_SERVER_URL (above)
    //   2. build the witnesses the circuit expects:
    //        getInitialPolicyHash()  -> policyHash passed in above
    //        getCandidateMetrics()   -> {idCommitment, skillsScore,
    //                                    experienceYears, usedForbiddenData}
    //        getCurrentTimestamp()   -> Date.now() / 1000
    //   3. call submitDecision(decision) on the deployed contract
    //   4. return the real receipt id and tx hash below
    // Keep the return shape identical or the Python side breaks.
    const stamp = Date.now().toString(16);
    return {
      verified: true,
      receiptId: `0x${stamp}stub`,
      txHash: null,
      note: "bridge stub, contract call not yet wired",
    };
  }

  throw new Error("real bridge path not implemented yet");
}

(async () => {
  try {
    const input = await readStdin();
    if (!input.policyHash) fail("bridge: missing policyHash on stdin");
    const result = await submitDecision(input);
    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    fail(`bridge error: ${err.message}`);
  }
})();
