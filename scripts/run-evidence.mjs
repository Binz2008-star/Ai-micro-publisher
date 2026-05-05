/**
 * M0 Evidence Table — Direct tRPC batch call runner
 */

const BASE_URL = "http://localhost:3000";

async function runEvidence() {
  const url = `${BASE_URL}/api/trpc/m0.runEvidence?batch=1`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ "0": { json: null } }),
  });
  const json = await res.json();
  if (!Array.isArray(json) || json[0]?.error) {
    throw new Error(JSON.stringify(json[0]?.error || json));
  }
  return json[0].result.data.json;
}

console.log("Running M0 5-run evidence table against live LLM...");
console.log("(This takes ~30-60s for 5 generations)\n");

const start = Date.now();
const result = await runEvidence();
const totalTime = ((Date.now() - start) / 1000).toFixed(1);

const { runs, summary } = result;

console.log("╔══════════════════════════════════════════════════════════════════════╗");
console.log("║         M0 EVIDENCE TABLE — 5-Run Validation                        ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝");
console.log("");
console.log("Run  Generated  Decision   Publish  Safety  Useful  Read  Rendered  Cost($)    Latency");
console.log("───  ─────────  ─────────  ───────  ──────  ──────  ────  ────────  ─────────  ───────");

for (const r of runs) {
  const gen = r.generated ? "  YES   " : "  NO    ";
  const dec = r.decision === "approve" ? " APPROVE " : " REJECT  ";
  const rend = r.rendered ? "  YES   " : "  NO    ";
  const cost = `$${r.estimatedCostUsd.toFixed(5)}`;
  const lat = `${(r.latencyMs / 1000).toFixed(1)}s`;
  const pub = String(r.publishScore).padStart(5);
  const saf = String(r.safetyScore).padStart(5);
  const use = String(r.usefulnessScore).padStart(5);
  const read = String(r.readabilityScore).padStart(4);
  console.log(` #${r.runNumber}  ${gen} ${dec} ${pub}    ${saf}   ${use}   ${read}  ${rend}  ${cost.padEnd(10)} ${lat}`);
}

console.log("");
console.log("╔══════════════════════════════════════════════════════════════════════╗");
console.log("║  SUMMARY                                                             ║");
console.log("╠══════════════════════════════════════════════════════════════════════╣");
console.log(`║  Pass Rate:           ${summary.passRate.padEnd(48)}║`);
console.log(`║  Avg Cost per Draft:  $${String(summary.avgCostUsd.toFixed(5)).padEnd(47)}║`);
console.log(`║  Avg Latency:         ${((summary.avgLatencyMs)/1000).toFixed(1).padEnd(47)}s║`);
console.log(`║  Useful Drafts:       ${summary.usefulDraftCount.padEnd(48)}║`);
console.log(`║  Rendered Pages:      ${summary.renderedPageCount.padEnd(48)}║`);
console.log(`║  Safety Failures:     ${String(summary.safetyFailures).padEnd(48)}║`);
console.log(`║  Total Wall Time:     ${(totalTime + "s").padEnd(48)}║`);
console.log("╠══════════════════════════════════════════════════════════════════════╣");
console.log(`║  DECISION:  ${summary.decision.padEnd(58)}║`);
console.log(`║  Reason:    ${summary.reason.substring(0, 57).padEnd(58)}║`);
console.log("╚══════════════════════════════════════════════════════════════════════╝");

// Per-run quality notes
console.log("\nPer-run quality notes:");
for (const r of runs) {
  const failedReasons = r.qualityReasons.filter(rr => rr.includes("Failed") || rr.includes("threshold"));
  if (failedReasons.length > 0) {
    console.log(`  Run #${r.runNumber}: ${failedReasons[0]}`);
  } else if (r.decision === "approve") {
    console.log(`  Run #${r.runNumber}: All thresholds passed`);
  }
  if (r.errorMessage) {
    console.log(`  Run #${r.runNumber} ERROR: ${r.errorMessage}`);
  }
}

// Save JSON output
import { writeFileSync } from "fs";
writeFileSync(
  "/home/ubuntu/ai-micro-publisher/scripts/m0-evidence-output.json",
  JSON.stringify({ runs, summary, totalWallTimeSeconds: parseFloat(totalTime) }, null, 2)
);
console.log("\nFull JSON output saved to scripts/m0-evidence-output.json");
