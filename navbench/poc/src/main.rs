//! navbench-poc — working PoC of the future internal navigation service
//! (specs/011/contracts/navigation-api.md). A tiny std-only HTTP server that
//! loads a fixture graph once and serves /route and /snap using the SAME
//! canonical model crate as the harness (no drifting copy).
//!
//! Endpoints:
//!   GET  /health                          -> {"ok":true}
//!   POST /route {origin,destination}      -> RouteResult (found/legs/transfers/
//!                                             distance_km/fare)
//!   POST /detour {origin,destination,restricted:[seg]} -> RouteResult bypassing
//!                                             the restricted segment(s)
//!   POST /snap   {point,tolerance_m?}     -> best snapped position across the
//!                                             network
//!
//! Usage: `cargo run --release -- <scale>` (scale default "small")

use navbench_rust::model::{self, Fixture, Point};
use serde::Deserialize;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;

#[derive(Deserialize)]
struct RouteReq {
    origin: Point,
    destination: Point,
    #[serde(default)]
    restricted: Vec<String>,
}

#[derive(Deserialize)]
struct SnapReq {
    point: Point,
    #[serde(default = "default_tol")]
    tolerance_m: f64,
}

fn default_tol() -> f64 {
    50.0
}

fn base_dir() -> String {
    env!("CARGO_MANIFEST_DIR").replace("\\", "/").replacen("navbench/poc", "navbench", 1)
}

fn load_fixture(scale: &str) -> Fixture {
    let mut s = String::new();
    fs::File::open(format!("{}/fixtures/inputs/{}.json", base_dir(), scale))
        .unwrap()
        .read_to_string(&mut s)
        .unwrap();
    serde_json::from_str(&s).unwrap()
}

fn handle(method: &str, path: &str, body: &str, fixture: &Fixture) -> (u16, String) {
    if method == "GET" && path == "/health" {
        return (200, json_ok(&serde_json::json!({"ok": true})));
    }
    if method != "POST" {
        return (405, json_err("method_not_allowed"));
    }
    match path {
        "/route" => {
            let req: RouteReq = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => return (400, json_err(&format!("bad_request: {}", e))),
            };
            let r = model::compute_route(
                &fixture.graph,
                &req.origin,
                &req.destination,
                &req.restricted,
            );
            (200, json_ok(&serde_json::to_value(&r).unwrap()))
        }
        "/detour" => {
            let req: RouteReq = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => return (400, json_err(&format!("bad_request: {}", e))),
            };
            // Restrict the first ride edge of the base route (like the detour
            // workload), then re-route.
            let base = model::compute_route(&fixture.graph, &req.origin, &req.destination, &[]);
            let mut banned = req.restricted;
            if let Some(legs) = &base.legs {
                if let Some(leg) = legs.first() {
                    if leg.stop_ids.len() >= 2 {
                        let (a, b) = (&leg.stop_ids[0], &leg.stop_ids[1]);
                        banned.push(if a < b {
                            format!("{}|{}", a, b)
                        } else {
                            format!("{}|{}", b, a)
                        });
                    }
                }
            }
            let r = model::compute_route(&fixture.graph, &req.origin, &req.destination, &banned);
            (200, json_ok(&serde_json::to_value(&r).unwrap()))
        }
        "/snap" => {
            let req: SnapReq = match serde_json::from_str(body) {
                Ok(r) => r,
                Err(e) => return (400, json_err(&format!("bad_request: {}", e))),
            };
            let r = model::snap_point(&fixture.graph, &req.point, req.tolerance_m);
            (200, json_ok(&serde_json::to_value(&r).unwrap()))
        }
        _ => (404, json_err("not_found")),
    }
}

fn json_ok(data: &serde_json::Value) -> String {
    serde_json::json!({ "success": true, "data": data }).to_string()
}
fn json_err(msg: &str) -> String {
    serde_json::json!({ "success": false, "error": { "code": msg } }).to_string()
}

fn serve(listener: TcpListener, fixture: Fixture) {
    for mut stream in listener.incoming().flatten() {
        let mut buf = Vec::new();
        let mut tmp = [0u8; 4096];
        let mut stream2 = match stream.try_clone() {
            Ok(s) => s,
            Err(_) => continue,
        };
        loop {
            match stream2.read(&mut tmp) {
                Ok(0) => break,
                Ok(n) => {
                    buf.extend_from_slice(&tmp[..n]);
                    if buf.windows(4).any(|w| w == b"\r\n\r\n") {
                        break;
                    }
                    if buf.len() > 8192 {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let text = String::from_utf8_lossy(&buf).to_string();
        let mut lines = text.lines();
        let req_line = lines.next().unwrap_or("").to_string();
        let mut parts = req_line.split_whitespace();
        let method = parts.next().unwrap_or("").to_string();
        let path = parts.next().unwrap_or("").to_string();
        let body = text.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
        let (status, payload) = handle(&method, &path, &body, &fixture);
        let len = payload.len();
        let resp = format!(
            "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            status, len, payload
        );
        let _ = stream.write_all(resp.as_bytes());
    }
}

fn main() {
    let scale = std::env::args().nth(1).unwrap_or_else(|| "small".to_string());
    let fixture = load_fixture(&scale);
    let addr = "127.0.0.1:8095";
    let listener = TcpListener::bind(addr).expect("bind");
    println!("navbench-poc listening on http://{addr} (scale={scale})");
    println!("  POST /route  POST /detour  POST /snap  GET /health");
    serve(listener, fixture);
}
