//! Rust benchmark runner (US2). Usage: `cargo run --release -- <scale>`
//! Loads navbench/fixtures/inputs/<scale>.json, runs the three workloads, and
//! writes navbench/results/rust/<scale>/rust-<ts>.json per benchmark-format.
use navbench_rust::model::*;
use serde_json::json;
use std::fs;
use std::io::Read;
use std::time::Instant;

const SAMPLE: usize = 60;
const WARMUP: usize = 20;
const BUDGET_MS: u128 = 5000;

fn iter_for(scale: &str) -> usize {
    match scale {
        "small" => 100,
        "medium" => 40,
        _ => 20,
    }
}

fn percentile(mut v: Vec<f64>, p: f64) -> f64 {
    if v.is_empty() {
        return 0.0;
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let idx = ((p / 100.0) * (v.len() as f64)).ceil() as usize - 1;
    let idx = idx.min(v.len() - 1).max(0);
    v[idx]
}

fn fixture_path(scale: &str) -> String {
    format!("{}/fixtures/inputs/{}.json", env!("CARGO_MANIFEST_DIR"), scale)
        .replace("\\", "/")
        .replacen("navbench/rust", "navbench", 1)
}

fn load_fixture(scale: &str) -> Fixture {
    let mut s = String::new();
    fs::File::open(fixture_path(scale))
        .unwrap()
        .read_to_string(&mut s)
        .unwrap();
    serde_json::from_str(&s).unwrap()
}

struct WorkloadResult {
    queries: usize,
    success_rate: f64,
    p50: f64,
    p90: f64,
    p99: f64,
    qps: f64,
}

fn run_workload<F>(mut f: F, queries: &[Request], iters: usize) -> WorkloadResult
where
    F: FnMut(&Request) -> RouteResult,
{
    let mut lats: Vec<f64> = Vec::new();
    let mut success = 0u64;
    let mut fail = 0u64;
    let t0 = Instant::now();
    let max_q = iters * queries.len();
    for i in 0..max_q {
        let q = &queries[i % queries.len()];
        let s = Instant::now();
        let _ = f(q);
        let ms = s.elapsed().as_millis() as f64 + (s.elapsed().subsec_nanos() as f64 / 1e6);
        lats.push(ms);
        if (ms as u128) <= BUDGET_MS {
            success += 1;
        } else {
            fail += 1;
        }
    }
    let wall_ms = t0.elapsed().as_millis() as f64 + (t0.elapsed().subsec_nanos() as f64 / 1e6);
    let total = success + fail;
    WorkloadResult {
        queries: total as usize,
        success_rate: (success as f64 / total.max(1) as f64 * 1000.0).round() / 1000.0,
        p50: (percentile(lats.clone(), 50.0) * 1000.0).round() / 1000.0,
        p90: (percentile(lats.clone(), 90.0) * 1000.0).round() / 1000.0,
        p99: (percentile(lats.clone(), 99.0) * 1000.0).round() / 1000.0,
        qps: (total as f64 / (wall_ms / 1000.0) * 10.0).round() / 10.0,
    }
}

fn run_snap<F>(mut f: F, points: &[Point], iters: usize) -> WorkloadResult
where
    F: FnMut(&Point) -> Option<SnapResult>,
{
    let mut lats: Vec<f64> = Vec::new();
    let mut success = 0u64;
    let mut fail = 0u64;
    let t0 = Instant::now();
    let max_q = iters * points.len();
    for i in 0..max_q {
        let q = &points[i % points.len()];
        let s = Instant::now();
        let _ = f(q);
        let ms = s.elapsed().as_millis() as f64 + (s.elapsed().subsec_nanos() as f64 / 1e6);
        lats.push(ms);
        if (ms as u128) <= BUDGET_MS {
            success += 1;
        } else {
            fail += 1;
        }
    }
    let wall_ms = t0.elapsed().as_millis() as f64 + (t0.elapsed().subsec_nanos() as f64 / 1e6);
    let total = success + fail;
    WorkloadResult {
        queries: total as usize,
        success_rate: (success as f64 / total.max(1) as f64 * 1000.0).round() / 1000.0,
        p50: (percentile(lats.clone(), 50.0) * 1000.0).round() / 1000.0,
        p90: (percentile(lats.clone(), 90.0) * 1000.0).round() / 1000.0,
        p99: (percentile(lats.clone(), 99.0) * 1000.0).round() / 1000.0,
        qps: (total as f64 / (wall_ms / 1000.0) * 10.0).round() / 10.0,
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let scale = args.get(1).map(|s| s.as_str()).unwrap_or("small");
    let fixture = load_fixture(scale);
    let graph = &fixture.graph;
    let requests = fixture.requests.iter().take(SAMPLE).cloned().collect::<Vec<_>>();
    let snap_points: Vec<Point> = requests
        .iter()
        .flat_map(|r| vec![r.origin.clone(), r.destination.clone()])
        .collect();

    // Warmup.
    for r in requests.iter().take(WARMUP.min(requests.len())) {
        let _ = compute_route(graph, &r.origin, &r.destination, &[]);
    }

    let iters = iter_for(scale);

    let ro = run_workload(
        |r| compute_route(graph, &r.origin, &r.destination, &[]),
        &requests,
        iters,
    );
    let ps = run_snap(|p| snap_point(graph, p, 50.0), &snap_points, iters);
    let dp = run_workload(
        |r| {
            let base = compute_route(graph, &r.origin, &r.destination, &[]);
            let restricted: Vec<String> = base
                .legs
                .as_ref()
                .and_then(|l| l.first())
                .filter(|leg| leg.stop_ids.len() >= 2)
                .map(|leg| {
                    let (a, b) = (&leg.stop_ids[0], &leg.stop_ids[1]);
                    if a < b {
                        format!("{}|{}", a, b)
                    } else {
                        format!("{}|{}", b, a)
                    }
                })
                .into_iter()
                .collect();
            compute_route(graph, &r.origin, &r.destination, &restricted)
        },
        &requests,
        iters,
    );

    let hash = {
        // Deterministic FNV-1a over the graph JSON (std-only, no sha1 dep).
        let bytes = serde_json::to_string(graph).unwrap().into_bytes();
        let mut h: u64 = 0xcbf29ce484222325;
        for b in &bytes {
            h ^= *b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        format!("{:012x}", h)
    };

    let result = json!({
        "schema_version": "1.0.0",
        "runtime": { "name": "rust", "version": env!("CARGO_PKG_VERSION"), "build_flags": "release" },
        "environment": {
            "os": std::env::consts::OS,
            "cpu": "<from env>",
            "mem_gb": 16.0
        },
        "graph": { "scale": graph.scale, "seed": graph.seed, "hash": hash },
        "runs": { "iterations": iters, "warmup_queries": WARMUP },
        "workloads": [
            { "workload_id": "route_optimization",
              "queries": ro.queries, "success_rate": ro.success_rate,
              "latency_ms": { "p50": ro.p50, "p90": ro.p90, "p99": ro.p99 },
              "throughput_qps": ro.qps, "peak_rss_mb": 0.0 },
            { "workload_id": "polyline_snapping",
              "queries": ps.queries, "success_rate": ps.success_rate,
              "latency_ms": { "p50": ps.p50, "p90": ps.p90, "p99": ps.p99 },
              "throughput_qps": ps.qps, "peak_rss_mb": 0.0 },
            { "workload_id": "detour_pathfinding",
              "queries": dp.queries, "success_rate": dp.success_rate,
              "latency_ms": { "p50": dp.p50, "p90": dp.p90, "p99": dp.p99 },
              "throughput_qps": dp.qps, "peak_rss_mb": 0.0 }
        ]
    });

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        .to_string();
    let dir = format!(
        "{}/results/rust/{}",
        env!("CARGO_MANIFEST_DIR").replace("\\", "/").replacen("navbench/rust", "navbench", 1),
        scale
    );
    fs::create_dir_all(&dir).unwrap();
    let file = format!("{}/rust-{}.json", dir, ts);
    fs::write(&file, serde_json::to_string_pretty(&result).unwrap()).unwrap();
    println!("[{}] wrote {}", scale, file);
    println!("  route_optimization: p50={}ms p90={}ms p99={}ms qps={} success={}", ro.p50, ro.p90, ro.p99, ro.qps, ro.success_rate);
    println!("  polyline_snapping: p50={}ms p90={}ms p99={}ms qps={} success={}", ps.p50, ps.p90, ps.p99, ps.qps, ps.success_rate);
    println!("  detour_pathfinding: p50={}ms p90={}ms p99={}ms qps={} success={}", dp.p50, dp.p90, dp.p99, dp.qps, dp.success_rate);
}
