/**
 * M0 Evidence Table Runner
 * Calls the live dev server's tRPC endpoint to run 5 generations and capture results.
 */

const BASE_URL = "http://localhost:3000";

async function callTRPC(procedure, input = {}) {
  const url = `${BASE_URL}/api/trpc/${procedure}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result?.data;
}

console.log("Running M0 5-run evidence table...\n");

try {
  const result = await callTRPC("m0.runEvidence");

  const { runs, summary } = result;

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("  M0 EVIDENCE TABLE — 5-Run Validation");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("");

  // Table header
  console.log(
    "Run | Generated | Decision | Publish | Safety | Useful | Read | Rendered | Cost($)   | Latency(s)"
  );
  console.log(
    "----+-----------+----------+---------+--------+--------+------+----------+-----------+-----------"
  );

  for (const r of runs) {
    const gen = r.generated ? "✓" : "✗";
    const dec = r.decision === "approve" ? "APPROVE" : "REJECT ";
    const rend = r.rendered ? "✓" : "✗";
    const cost = r.estimatedCostUsd.toFixed(5);
    const lat = (r.latencyMs / 1000).toFixed(1);

    console.log(
      ` #${r.runNumber}  | ${gen.padEnd(9)} | ${dec}  | ${String(r.publishScore).padEnd(7)} | ${String(r.safetyScore).padEnd(6)} | ${String(r.usefulnessScore).padEnd(6)} | ${String(r.readabilityScore).padEnd(4)} | ${rend.padEnd(8)} | $${cost} | ${lat}s`
    );
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(`  Pass Rate:          ${summary.passRate}`);
  console.log(`  Avg Cost per Draft: $${summary.avgCostUsd.toFixed(5)}`);
  console.log(`  Avg Latency:        ${(summary.avgLatencyMs / 1000).toFixed(1)}s`);
  console.log(`  Useful Drafts:      ${summary.usefulDraftCount}`);
  console.log(`  Rendered Pages:     ${summary.renderedPageCount}`);
  console.log(`  Safety Failures:    ${summary.safetyFailures}`);
  console.log(`  Decision:           ${summary.decision}`);
  console.log(`  Reason:             ${summary.reason}`);
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("");

  // Print quality reasons for each run
  for (const r of runs) {
    if (r.qualityReasons.length > 0) {
      console.log(`Run #${r.runNumber} quality notes:`);
      r.qualityReasons.slice(0, 5).forEach((reason) => console.log(`  - ${reason}`));
    }
    if (r.errorMessage) {
      console.log(`Run #${r.runNumber} ERROR: ${r.errorMessage}`);
    }
  }

  // Output JSON for programmatic use
  const outputPath = "/home/ubuntu/ai-micro-publisher/scripts/m0-evidence-output.json";
  const { writeFileSync } = await import("fs");
  writeFileSync(outputPath, JSON.stringify({ runs, summary }, null, 2));
  console.log(`\nFull output saved to: ${outputPath}`);

} catch (err) {
  console.error("Evidence run failed:", err.message);
  process.exit(1);
}
