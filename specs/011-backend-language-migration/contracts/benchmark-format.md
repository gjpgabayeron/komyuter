# Contract: Benchmark Result Format

The shared JSON every runtime (Node/Rust/Go) emits so results aggregate identically into the comparison matrix (FR-005, R4). A single `results/` aggregator script consumes these and produces the matrix + the ADR's evidence.

## Top-level result object

```jsonc
{
  "schema_version": "1.0.0",
  "runtime": {
    "name": "node" | "rust" | "go",
    "version": "v24.12.0",              // recorded exactly (node -v / rustc -V / go version)
    "build_flags": "release | debug"    // native: compiled with optimizations
  },
  "environment": {
    "os": "windows/amd64",
    "cpu": "<model from measurable env>",
    "mem_gb": 16
  },
  "graph": { "scale": "baseline" | "stretch", "seed": 1337, "hash": "sha256:..." },
  "runs": {
    "iterations": 200,                  // fixed harness count per workload
    "warmup_queries": 20                // excluded from stats
  },
  "workloads": [
    {
      "workload_id": "route_optimization",
      "queries": 200,
      "success_rate": 1.0,              // found / total → must be ≥ 0.95
      "latency_ms": { "p50": 12, "p90": 40, "p99": 90 },
      "throughput_qps": 2200,
      "peak_rss_mb": 64
    }
    // ... polyline_snapping, detour_pathfinding
  ]
}
```

## Rules

- **One file per runtime per run** in `navbench/results/<runtime>/<timestamp>.bench.json`, consumed by the aggregator.
- `latency_ms` values are numbers in milliseconds; `throughput_qps` is queries per second over the measured window (excl. warmup).
- `success_rate` is `found / total` per workload; the pass bar is **≥ 0.95**.
- **Pass threshold (R4 / CRITIQUE)**: `latency_ms.p90 ≤ 500` for a runtime to be considered viable at the tested scale.
- Toolchain versions are required and exact so runs are reproducible (R5).
- The aggregator writes the cross-runtime **comparison matrix** (criteria × candidate) which feeds the decision ADR (FR-006) and, if the gate passes, justifies the PoC (FR-008).

## Aggregator output → comparison matrix

|                               | Node (current) | Rust | Go  |
| ----------------------------- | -------------- | ---- | --- |
| p90 route_optimization (ms)   | ...            | ...  | ... |
| p90 polyline_snapping (ms)    | ...            | ...  | ... |
| p90 detour_pathfinding (ms)   | ...            | ...  | ... |
| success_rate                  | ...            | ...  | ... |
| peak_rss_mb                   | ...            | ...  | ... |
| _developer onboarding effort_ | reference      | ...  | ... |
| _ecosystem maturity_          | reference      | ...  | ... |
| _rewrite scope_               | n/a (current)  | ...  | ... |

> Non-performance rows (onboarding, ecosystem, rewrite scope) are qualitative and recorded with explicit rationale; any row the study cannot measure is explicitly marked "not measured" per SC-002.
