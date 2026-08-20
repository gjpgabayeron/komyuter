"use strict";
/**
 * Node baseline runner (T012 / T013). Loads each fixture scale, runs the three
 * workloads over the request set with warmup + repetitions, and writes one
 * results/{scale}/node-baseline-<ts>.json per scale (benchmark-format.md).
 *
 * Metrics: p50/p90/p99 per-query latency, throughput (queries/sec), success
 * (completion within budget) rate, and peak RSS (sampled).
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { emptyResult } = require("../../shared/workloads.js");
const workloads = require("./workloads.js");

const INPUT_DIR = path.join(__dirname, "..", "..", "fixtures", "inputs");
const OUT_DIR = path.join(__dirname, "..", "..", "results");
const SCALES = ["small", "medium", "large", "rush"];
const SAMPLE = 60; // bounded query sample per workload (route + snap points)
// Iterations per scale — large/rush are the slow ones; smaller scales get more
// reps so p50/p90 are still statistically meaningful.
const ITER_BY_SCALE = { small: 100, medium: 40, large: 20, rush: 20 };
const WARMUP = 20;
const TIME_BUDGET_MS = 5000; // a query exceeding this is a failure (timeout)

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function stats(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50: +percentile(sorted, 50).toFixed(3),
    p90: +percentile(sorted, 90).toFixed(3),
    p99: +percentile(sorted, 99).toFixed(3),
  };
}

function buildQueries(fixture) {
  const graph = fixture.graph;
  const requests = fixture.requests.slice(0, SAMPLE);
  // route_optimization + detour: one per sampled request.
  const route = requests;
  // snapping: snap each request origin AND destination to all directions
  // (single multi-candidate query per point).
  const snapPoints = [];
  for (const r of requests) {
    snapPoints.push(r.origin, r.destination);
  }
  const directions = [];
  for (const rt of graph.routes)
    for (const d of rt.directions) directions.push(d);
  return { route, snapPoints, directions };
}

class RssSampler {
  constructor(intervalMs = 20) {
    this.peak = 0;
    this._t = setInterval(() => {
      let rss = 0;
      try {
        rss = process.memoryUsage().rss / 1024 / 1024; // MB
      } catch {}
      if (rss > this.peak) this.peak = rss;
    }, intervalMs);
  }
  stop() {
    clearInterval(this._t);
    return this.peak;
  }
}

function runWorkload(fn, queryIter, budgetMs, ITER) {
  const lats = [];
  let success = 0;
  let fail = 0;
  const sampler = new RssSampler();
  const t0 = process.hrtime.bigint();
  const maxQ = ITER * queryIter.length;
  for (let i = 0; i < maxQ; i++) {
    const q = queryIter[i % queryIter.length];
    const s = process.hrtime.bigint();
    try {
      fn(q);
    } catch {
      fail++;
      const e = process.hrtime.bigint();
      lats.push(Number(e - s) / 1e6);
      continue;
    }
    const e = process.hrtime.bigint();
    const ms = Number(e - s) / 1e6;
    lats.push(ms);
    if (ms <= budgetMs) success++;
    else fail++;
  }
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
  sampler.stop();
  const total = success + fail;
  return {
    queries: total,
    success_rate: +(success / (total || 1)).toFixed(3),
    latency_ms: stats(lats),
    throughput_qps: +(total / (wallMs / 1000)).toFixed(1),
    peak_rss_mb: +sampler.peak.toFixed(1),
    wall_ms: +wallMs.toFixed(1),
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  for (const scale of SCALES) {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(INPUT_DIR, `${scale}.json`), "utf8"),
    );
    const { route, snapPoints, directions } = buildQueries(fixture);

    const result = emptyResult("node", process.version, fixture.graph);
    result.environment = {
      os: `${os.platform()} ${os.release()}`,
      cpu: os.cpus()[0] ? os.cpus()[0].model : "unknown",
      mem_gb: Math.round(os.totalmem() / 1024 ** 3),
    };
    result.graph.hash = require("crypto")
      .createHash("sha1")
      .update(JSON.stringify(fixture.graph))
      .digest("hex")
      .slice(0, 12);

    // Warmup.
    for (const r of route.slice(0, Math.min(WARMUP, route.length))) {
      workloads.routeOptimization(fixture, r);
    }

    const ITER = ITER_BY_SCALE[scale];
    const ro = runWorkload(
      (r) => workloads.routeOptimization(fixture, r),
      route,
      TIME_BUDGET_MS,
      ITER,
    );
    const ps = runWorkload(
      (p) => workloads.polylineSnapping(fixture, p),
      snapPoints,
      TIME_BUDGET_MS,
      ITER,
    );
    const dp = runWorkload(
      (r) => workloads.detourPathfinding(fixture, r),
      route,
      TIME_BUDGET_MS,
      ITER,
    );

    result.runs = { iterations: ITER, warmup_queries: WARMUP };
    result.workloads = [
      { workload_id: "route_optimization", ...ro },
      { workload_id: "polyline_snapping", ...ps },
      { workload_id: "detour_pathfinding", ...dp },
    ];

    const dir = path.join(OUT_DIR, "node", scale);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `node-baseline-${ts}.json`);
    fs.writeFileSync(file, JSON.stringify(result, null, 2));
    console.log(`\n[${scale}] wrote ${file}`);
    for (const w of result.workloads) {
      console.log(
        `  ${w.workload_id}: p50=${w.latency_ms.p50}ms p90=${w.latency_ms.p90}ms ` +
          `p99=${w.latency_ms.p99}ms qps=${w.throughput_qps} success=${w.success_rate} rss=${w.peak_rss_mb}MB`,
      );
    }
  }
}

if (require.main === module) main();
module.exports = { percentile, stats, buildQueries };
