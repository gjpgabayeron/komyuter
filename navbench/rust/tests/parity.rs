//! Rust parity test (T014 / FR-010 / SC-005). Loads the canonical oracle and
//! asserts this runtime reproduces the navigational INVARIANTS (found,
//! distance_km, transfers, walk_m, fare.total) exactly. Any divergence is a
//! port bug (Principle III).

use navbench_rust::model::{compute_route, snap_direction, Fixture, Point};
use serde::Deserialize;
use std::fs;
use std::io::Read;

#[derive(Debug, Deserialize)]
struct OracleCase {
    input: OracleInput,
    expected_output: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct OracleInput {
    workload_id: String,
    request: OracleRequest,
}

#[derive(Debug, Deserialize)]
struct OracleRequest {
    #[serde(default)]
    origin: Option<Point>,
    #[serde(default)]
    destination: Option<Point>,
    #[serde(default)]
    direction_id: Option<String>,
    #[serde(default)]
    point: Option<Point>,
    #[serde(default)]
    tolerance_m: Option<f64>,
    #[serde(default)]
    _restricted_segment_id: Option<String>,
}

fn base_dir() -> String {
    env!("CARGO_MANIFEST_DIR").replace("\\", "/").replacen("navbench/rust", "navbench", 1)
}

fn load_fixture(scale: &str) -> Fixture {
    let mut s = String::new();
    fs::File::open(format!("{}/fixtures/inputs/{}.json", base_dir(), scale))
        .unwrap()
        .read_to_string(&mut s)
        .unwrap();
    serde_json::from_str(&s).unwrap()
}

fn load_oracle(scale: &str) -> Vec<OracleCase> {
    let mut s = String::new();
    fs::File::open(format!("{}/fixtures/oracle/{}.json", base_dir(), scale))
        .unwrap()
        .read_to_string(&mut s)
        .unwrap();
    serde_json::from_str(&s).unwrap()
}

fn assert_result_eq(actual: &serde_json::Value, expected: &serde_json::Value, ctx: &str) {
    let expected_found = expected["found"].as_bool().unwrap();
    assert_eq!(
        actual["found"].as_bool().unwrap(),
        expected_found,
        "[{}] found mismatch",
        ctx
    );
    if !expected_found {
        return;
    }
    for (field, label) in [
        ("distance_km", "distance_km"),
        ("transfers", "transfers"),
        ("walk_m", "walk_m"),
    ] {
        // Normalize to f64 so JS `0` and Rust `0.0` compare equal.
        assert_eq!(
            actual[field].as_f64(),
            expected[field].as_f64(),
            "[{}] {} mismatch",
            ctx,
            label
        );
    }
    assert_eq!(
        actual["fare"]["total"].as_f64(),
        expected["fare"]["total"].as_f64(),
        "[{}] fare.total mismatch",
        ctx
    );
}

fn detour_request(fixture: &Fixture, origin: &Point, destination: &Point) -> Vec<String> {
    // Mirror the oracle + node baseline: restrict the first ride edge of the
    // base route's first leg, then recompute.
    let base = compute_route(&fixture.graph, origin, destination, &[]);
    let mut banned = Vec::new();
    if let Some(legs) = &base.legs {
        if let Some(leg) = legs.first() {
            if leg.stop_ids.len() >= 2 {
                let a = &leg.stop_ids[0];
                let b = &leg.stop_ids[1];
                let seg = if a < b {
                    format!("{}|{}", a, b)
                } else {
                    format!("{}|{}", b, a)
                };
                banned.push(seg);
            }
        }
    }
    banned
}

#[test]
fn parity_all_scales() {
    let mut total = 0usize;
    for scale in ["small", "medium", "large", "rush"] {
        let fixture = load_fixture(scale);
        let oracle = load_oracle(scale);
        let mut n = 0usize;
        for case in &oracle {
            match case.input.workload_id.as_str() {
                "route_optimization" => {
                    let req = &case.input.request;
                    let origin = req.origin.as_ref().unwrap();
                    let destination = req.destination.as_ref().unwrap();
                    let actual = compute_route(&fixture.graph, origin, destination, &[]);
                    let av = serde_json::to_value(&actual).unwrap();
                    assert_result_eq(&av, &case.expected_output, "route_optimization");
                    n += 1;
                }
                "detour_pathfinding" => {
                    let req = &case.input.request;
                    let origin = req.origin.as_ref().unwrap();
                    let destination = req.destination.as_ref().unwrap();
                    let banned = detour_request(&fixture, origin, destination);
                    let actual = compute_route(&fixture.graph, origin, destination, &banned);
                    let av = serde_json::to_value(&actual).unwrap();
                    assert_result_eq(&av, &case.expected_output, "detour_pathfinding");
                    n += 1;
                }
                "polyline_snapping" => {
                    let req = &case.input.request;
                    let point = req.point.as_ref().unwrap();
                    let tol = req.tolerance_m.unwrap_or(30.0);
                    let dir_id = req.direction_id.as_ref().unwrap();
                    // Oracle is single-direction: snap to that direction's
                    // polyline only (identical semantics to the oracle).
                    let polyline = fixture
                        .graph
                        .routes
                        .iter()
                        .flat_map(|rt| rt.directions.iter())
                        .find(|d| &d.id == dir_id)
                        .map(|d| d.polyline.clone());
                    let actual = match polyline {
                        Some(pl) => snap_direction(dir_id.clone(), &pl, point, tol),
                        None => None,
                    };
                    let expected_null = case.expected_output.is_null();
                    match (&actual, expected_null) {
                        (None, true) => {}
                        (Some(s), false) => {
                            let av = serde_json::to_value(s).unwrap();
                            let e = &case.expected_output;
                            assert_eq!(
                                av["direction_id"], e["direction_id"],
                                "[snap {}] direction_id",
                                scale
                            );
                            assert_eq!(av["distance_m"].as_f64(), e["distance_m"].as_f64(), "[snap] distance");
                            assert_eq!(av["position_on_polyline"]["lng"], e["position_on_polyline"]["lng"], "[snap] lng");
                            assert_eq!(av["position_on_polyline"]["lat"], e["position_on_polyline"]["lat"], "[snap] lat");
                            n += 1;
                        }
                        (Some(_), true) => panic!("[snap {}] expected null, got result", scale),
                        (None, false) => panic!("[snap {}] expected result, got null", scale),
                    }
                }
                _ => {}
            }
        }
        println!("parity {}: {} cases checked", scale, n);
        total += n;
    }
    println!("ALL PARITY CHECKS PASSED ({} cases)", total);
}
