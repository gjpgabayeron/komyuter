"use strict";
/**
 * Shared workload definitions + I/O shapes (T008) — from contracts/workloads.md.
 * Pure data/definitions consumed by the Node baseline, the aggregator, and
 * referenced by the Rust/Go harnesses for parity.
 */

const WORKLOADS = {
  route_optimization: "Multi-criteria Dijkstra on the route-expanded graph",
  polyline_snapping:
    "Snap a point to the nearest on-network position (25-50 m)",
  detour_pathfinding:
    "route_optimization + request-time virtual nodes + re-run",
};

const PROFILES = ["shortest", "cheapest", "least_transfers", "balanced"];

/** Default LTFRB fare params (constitution; ADR-0001). */
const DEFAULT_FARE = { base_fare: 13, base_dist_km: 4, rate_per_km: 1.8 };

/** The 4 fixture scales the study runs against. */
const SCALES = ["small", "medium", "large", "rush"];

/**
 * Benchmark result schema (from contracts/benchmark-format.md). Each runtime
 * emits one object of this shape per run.
 */
function emptyResult(runtimeName, runtimeVersion, graph) {
  return {
    schema_version: "1.0.0",
    runtime: {
      name: runtimeName,
      version: runtimeVersion,
      build_flags: "release",
    },
    environment: { os: process.platform, cpu: "<from env>", mem_gb: 16 },
    graph: { scale: graph.scale, seed: graph.seed, hash: "" },
    runs: { iterations: 200, warmup_queries: 20 },
    workloads: [
      {
        workload_id: "route_optimization",
        queries: 0,
        success_rate: 0,
        latency_ms: { p50: 0, p90: 0, p99: 0 },
        throughput_qps: 0,
        peak_rss_mb: 0,
      },
      {
        workload_id: "polyline_snapping",
        queries: 0,
        success_rate: 0,
        latency_ms: { p50: 0, p90: 0, p99: 0 },
        throughput_qps: 0,
        peak_rss_mb: 0,
      },
      {
        workload_id: "detour_pathfinding",
        queries: 0,
        success_rate: 0,
        latency_ms: { p50: 0, p90: 0, p99: 0 },
        throughput_qps: 0,
        peak_rss_mb: 0,
      },
    ],
  };
}

/**
 * success_rate definition (documented deviation from the literal reading of
 * contracts/benchmark-format.md "found / total"):
 *   success_rate = completed within budget / total queries.
 * A successful response is EITHER a found route OR a valid not-found answer —
 * both are correct product outputs (navigation shows a "no route" state).
 * Using found/total would penalize every runtime identically whenever the
 * graph has realistic disconnected clusters. This measures engine completion,
 * which is what CRITIQUE's ≤500 ms-per-90%-of-queries target cares about.
 */
const PASS_LATENCY_P90_MS = 500; // CRITIQUE: ≤500 ms for 90% of queries
const SUCCESS_RATE_MIN = 0.95;

module.exports = {
  WORKLOADS,
  PROFILES,
  DEFAULT_FARE,
  SCALES,
  emptyResult,
  PASS_LATENCY_P90_MS,
  SUCCESS_RATE_MIN,
};
