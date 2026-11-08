"use strict";
/**
 * Aggregator (T022). Consumes per-runtime, per-scale benchmark JSON under
 * navbench/results/<runtime>/<scale>/*.json and produces the cross-runtime
 * comparison matrix (contracts/benchmark-format.md) plus a machine-readable
 * matrix JSON that feeds the decision ADR (docs/adr/0017-*.md).
 */
const fs = require("fs");
const path = require("path");
const {
  PASS_LATENCY_P90_MS,
  SUCCESS_RATE_MIN,
} = require("../shared/workloads.js");

const RESULTS_DIR = path.join(__dirname, "..", "results");
const SCALES = ["small", "medium", "large", "rush"];

/** Collect the newest result file for each (runtime, scale). */
function collect() {
  const byRuntimeScale = {}; // runtime -> scale -> result
  if (!fs.existsSync(RESULTS_DIR)) return byRuntimeScale;
  for (const runtime of fs.readdirSync(RESULTS_DIR, { withFileTypes: true })) {
    if (!runtime.isDirectory()) continue;
    const rdir = path.join(RESULTS_DIR, runtime.name);
    for (const scale of fs.readdirSync(rdir, { withFileTypes: true })) {
      if (!scale.isDirectory()) continue;
      const sdir = path.join(rdir, scale.name);
      const jsons = fs
        .readdirSync(sdir)
        .filter((f) => f.endsWith(".json"))
        .sort();
      if (jsons.length) {
        byRuntimeScale[runtime.name] = byRuntimeScale[runtime.name] || {};
        byRuntimeScale[runtime.name][scale.name] = JSON.parse(
          fs.readFileSync(path.join(sdir, jsons[jsons.length - 1]), "utf8"),
        );
      }
    }
  }
  return byRuntimeScale;
}

function wlMap(rt) {
  return rt.workloads.reduce((acc, x) => ((acc[x.workload_id] = x), acc), {});
}

function main() {
  const byRuntimeScale = collect();
  const matrix = {};
  for (const [runtime, scales] of Object.entries(byRuntimeScale)) {
    matrix[runtime] = {};
    for (const scale of SCALES) {
      const rt = scales[scale];
      if (!rt) {
        matrix[runtime][scale] = { status: "not_measured" };
        continue;
      }
      const w = wlMap(rt);
      const ro = w.route_optimization || {};
      const ps = w.polyline_snapping || {};
      const dp = w.detour_pathfinding || {};
      const entry = {
        status: "measured",
        runtime_version: rt.runtime && rt.runtime.version,
        iterations: rt.runs && rt.runs.iterations,
        workloads: {
          route_optimization: {
            p90_ms: ro.latency_ms && ro.latency_ms.p90,
            qps: ro.throughput_qps,
            success_rate: ro.success_rate,
            pass_latency: Boolean(
              ro.latency_ms && ro.latency_ms.p90 <= PASS_LATENCY_P90_MS,
            ),
          },
          polyline_snapping: {
            p90_ms: ps.latency_ms && ps.latency_ms.p90,
            qps: ps.throughput_qps,
            success_rate: ps.success_rate,
            pass_latency: Boolean(
              ps.latency_ms && ps.latency_ms.p90 <= PASS_LATENCY_P90_MS,
            ),
          },
          detour_pathfinding: {
            p90_ms: dp.latency_ms && dp.latency_ms.p90,
            qps: dp.throughput_qps,
            success_rate: dp.success_rate,
            pass_latency: Boolean(
              dp.latency_ms && dp.latency_ms.p90 <= PASS_LATENCY_P90_MS,
            ),
          },
        },
      };
      matrix[runtime][scale] = entry;
    }
  }

  const out = {
    generated_at: new Date().toISOString(),
    pass_latency_p90_ms: PASS_LATENCY_P90_MS,
    success_rate_min: SUCCESS_RATE_MIN,
    note:
      "success_rate = completion within budget (found OR valid not-found). " +
      "All three runtimes (node, rust, go) measured on go1.27.0/rustc1.92/node24.",
    matrix,
  };

  const file = path.join(RESULTS_DIR, "comparison-matrix.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2));

  // Human-readable summary.
  console.log("=== navbench comparison matrix (p90 latency ms) ===");
  const rows = [
    "route_optimization",
    "polyline_snapping",
    "detour_pathfinding",
  ];
  const header = ["runtime/scale", ...SCALES].join("\t");
  console.log(header);
  for (const runtime of Object.keys(matrix)) {
    for (const wl of rows) {
      const cells = [wl];
      for (const scale of SCALES) {
        const e = matrix[runtime][scale];
        if (!e || e.status !== "measured") {
          cells.push("n/m");
          continue;
        }
        const p = e.workloads[wl].p90_ms;
        cells.push(p === undefined ? "-" : String(p));
      }
      console.log(`${runtime}.${wl}\t${cells.slice(1).join("\t")}`);
    }
  }
  console.log("\nWrote results/comparison-matrix.json");
}

if (require.main === module) main();
module.exports = { collect };
