//! Canonical navigation model port (Rust) — must reproduce the JS oracle's
//! navigational invariants (SC-005 / FR-010): found, distance_km, transfers,
//! walk_m, fare.total. Coordinate order is [lng, lat].

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Point {
    pub lng: f64,
    pub lat: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fare {
    pub base_fare: f64,
    pub base_dist_km: f64,
    pub rate_per_km: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stop {
    pub id: String,
    pub lng: f64,
    pub lat: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Direction {
    pub id: String,
    pub stop_ids: Vec<String>,
    pub polyline: Vec<Point>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Route {
    pub id: String,
    pub directions: Vec<Direction>,
    #[serde(default)]
    pub fare: Option<Fare>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Graph {
    pub scale: String,
    pub seed: u64,
    pub center: Point,
    pub stops: Vec<Stop>,
    pub routes: Vec<Route>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub origin: Point,
    pub destination: Point,
    pub profile: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fixture {
    pub graph: Graph,
    pub requests: Vec<Request>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Leg {
    pub route_id: String,
    pub direction_id: String,
    pub stop_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteResult {
    pub found: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub legs: Option<Vec<Leg>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transfers: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub walk_m: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distance_km: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fare: Option<FareOutput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FareOutput {
    pub total: f64,
    pub legs: Vec<f64>,
    pub discounted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapResult {
    pub direction_id: String,
    pub position_on_polyline: Point,
    pub distance_m: f64,
}

pub const BASE_ON_BOARD: f64 = 13.0;
pub const MARGINAL_PER_KM: f64 = 1.8;
pub const TRANSFER_COST: f64 = 2.0;

fn haversine_km(a: &Point, b: &Point) -> f64 {
    haversine_km_xy(a.lng, a.lat, b.lng, b.lat)
}

fn haversine_km_xy(lng1: f64, lat1: f64, lng2: f64, lat2: f64) -> f64 {
    const R: f64 = 6371.0088;
    let dlat = (lat2 - lat1).to_radians();
    let dlng = (lng2 - lng1).to_radians();
    let la1 = lat1.to_radians();
    let la2 = lat2.to_radians();
    let h = (dlat / 2.0).sin().powi(2)
        + la1.cos() * la2.cos() * (dlng / 2.0).sin().powi(2);
    2.0 * R * h.sqrt().asin()
}

fn haversine_km_stop(a: &Stop, b: &Stop) -> f64 {
    haversine_km_xy(a.lng, a.lat, b.lng, b.lat)
}

fn round(x: f64, decimals: i32) -> f64 {
    let f = 10f64.powi(decimals);
    (x * f).round() / f
}

/// Membership of a stop in a route direction.
#[derive(Debug, Clone)]
struct Membership {
    route: String,
    dir: String,
}

/// Adjacency: stopId -> memberships; stopId -> incident ride edges (route,dir,km,to).
struct BuiltGraph {
    by_stop: HashMap<String, Vec<Membership>>,
    stop_ride: HashMap<String, Vec<(String, String, f64, String)>>, // from -> (route,dir,km,to)
}

fn build_graph(g: &Graph) -> BuiltGraph {
    let mut by_stop: HashMap<String, Vec<Membership>> = HashMap::new();
    let mut stop_ride: HashMap<String, Vec<(String, String, f64, String)>> = HashMap::new();
    let stops: HashMap<&str, &Stop> = g.stops.iter().map(|s| (s.id.as_str(), s)).collect();

    for rt in &g.routes {
        for dir in &rt.directions {
            let ids = &dir.stop_ids;
            for i in 0..ids.len() {
                by_stop
                    .entry(ids[i].clone())
                    .or_default()
                    .push(Membership { route: rt.id.clone(), dir: dir.id.clone() });
                if i + 1 < ids.len() {
                    let (a, b) = (&ids[i], &ids[i + 1]);
                    let pa = stops.get(a.as_str()).copied().unwrap();
                    let pb = stops.get(b.as_str()).copied().unwrap();
                    let km = round(haversine_km_stop(pa, pb), 4);
                    stop_ride
                        .entry(a.clone())
                        .or_default()
                        .push((rt.id.clone(), dir.id.clone(), km, b.clone()));
                    stop_ride
                        .entry(b.clone())
                        .or_default()
                        .push((rt.id.clone(), dir.id.clone(), km, a.clone()));
                }
            }
        }
    }
    // Drop the unused ride map entirely; per-stop adjacency drives relaxation.
    BuiltGraph { by_stop, stop_ride }
}

fn fnv(key: &str) -> u64 {
    // Deterministic hash of "stop|route|dir" used for stable tie-breaking
    // across languages (independent of HashMap iteration order).
    let mut h: u64 = 0xcbf29ce484222325;
    for b in key.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// Binomial min-heap on (cost, tieKey).
struct Heap {
    cost: Vec<f64>,
    tie: Vec<u64>,
    key: Vec<String>,
}

impl Heap {
    fn new() -> Self {
        Heap { cost: Vec::new(), tie: Vec::new(), key: Vec::new() }
    }
    fn push(&mut self, cost: f64, tie: u64, key: String) {
        self.cost.push(cost);
        self.tie.push(tie);
        self.key.push(key);
        self.up(self.cost.len() - 1);
    }
    fn len(&self) -> usize {
        self.cost.len()
    }
    fn less(&self, a: usize, b: usize) -> bool {
        self.cost[a] < self.cost[b]
            || (self.cost[a] == self.cost[b] && self.tie[a] < self.tie[b])
    }
    fn swap(&mut self, a: usize, b: usize) {
        self.cost.swap(a, b);
        self.tie.swap(a, b);
        self.key.swap(a, b);
    }
    fn up(&mut self, mut i: usize) {
        while i > 0 {
            let p = (i - 1) >> 1;
            if self.less(i, p) {
                self.swap(i, p);
                i = p;
            } else {
                break;
            }
        }
    }
    fn down(&mut self, mut i: usize) {
        let n = self.len();
        loop {
            let l = 2 * i + 1;
            let r = 2 * i + 2;
            let mut smallest = i;
            if l < n && self.less(l, smallest) {
                smallest = l;
            }
            if r < n && self.less(r, smallest) {
                smallest = r;
            }
            if smallest != i {
                self.swap(i, smallest);
                i = smallest;
            } else {
                break;
            }
        }
    }
    fn pop(&mut self) -> Option<(f64, u64, String)> {
        if self.cost.is_empty() {
            return None;
        }
        let top = (self.cost[0], self.tie[0], self.key[0].clone());
        let last = self.cost.len() - 1;
        self.cost[0] = self.cost[last];
        self.tie[0] = self.tie[last];
        self.key[0] = self.key[last].clone();
        self.cost.pop();
        self.tie.pop();
        self.key.pop();
        if !self.cost.is_empty() {
            self.down(0);
        }
        Some(top)
    }
}

fn dijkstra(
    g: &Graph,
    graph: &BuiltGraph,
    from: &str,
    to: &str,
    banned: &std::collections::HashSet<String>,
) -> Option<(Vec<Leg>, f64, f64)> {
    let inf = f64::INFINITY;
    let mut dist: HashMap<String, f64> = HashMap::new();
    let mut prev: HashMap<String, String> = HashMap::new();
    let mut heap = Heap::new();

    if let Some(ms) = graph.by_stop.get(from) {
        for m in ms {
            let key = format!("{}|{}|{}", from, m.route, m.dir);
            if !dist.contains_key(&key) {
                dist.insert(key.clone(), BASE_ON_BOARD);
                heap.push(BASE_ON_BOARD, fnv(&key), key);
            }
        }
    }

    let mut steps: u64 = 0;
    while let Some((cc, _tie, cur)) = heap.pop() {
        if cc > *dist.get(&cur).unwrap_or(&inf) {
            continue;
        }
        if steps > 2_000_000 {
            return None;
        }
        steps += 1;
        let parts: Vec<&str> = cur.split('|').collect();
        let cstop = parts[0];
        let croute = parts[1];
        let cdir = parts[2];

        if cstop == to {
            let (legs, km) = reconstruct(g, &cur, &prev);
            let fare = fare_of(&legs, g);
            return Some((legs, km, fare));
        }

        // Transfers.
        if let Some(ms) = graph.by_stop.get(cstop) {
            for m in ms {
                if m.route == croute && m.dir == cdir {
                    continue;
                }
                let nk = format!("{}|{}|{}", cstop, m.route, m.dir);
                let nc = cc + TRANSFER_COST;
                if nc < *dist.get(&nk).unwrap_or(&inf) {
                    dist.insert(nk.clone(), nc);
                    prev.insert(nk.clone(), cur.clone());
                    heap.push(nc, fnv(&nk), nk);
                }
            }
        }

        // Ride edges incident to this stop on this direction.
        if let Some(incident) = graph.stop_ride.get(cstop) {
            for (eroute, edir, km, to) in incident {
                let seg = if cstop < to {
                    format!("{}|{}", cstop, to)
                } else {
                    format!("{}|{}", to, cstop)
                };
                if banned.contains(&seg) {
                    continue;
                }
                if eroute != croute || edir != cdir {
                    continue;
                }
                let nk = format!("{}|{}|{}", to, eroute, edir);
                let cost = cc + BASE_ON_BOARD + MARGINAL_PER_KM * km;
                if cost < *dist.get(&nk).unwrap_or(&inf) {
                    dist.insert(nk.clone(), cost);
                    prev.insert(nk.clone(), cur.clone());
                    heap.push(cost, fnv(&nk), nk);
                }
            }
        }
    }
    None
}

fn reconstruct(g: &Graph, end_key: &str, prev: &HashMap<String, String>) -> (Vec<Leg>, f64) {
    let mut legs: Vec<Leg> = Vec::new();
    let mut cur: Option<&str> = Some(end_key);
    while let Some(k) = cur {
        let parts: Vec<&str> = k.split('|').collect();
        let (s, r, d) = (parts[0].to_string(), parts[1].to_string(), parts[2].to_string());
        match legs.last_mut() {
            Some(last) if last.route_id == r && last.direction_id == d => {
                last.stop_ids.insert(0, s);
            }
            _ => legs.push(Leg { route_id: r, direction_id: d, stop_ids: vec![s] }),
        }
        cur = prev.get(k).map(|s| s.as_str());
    }
    legs.reverse();
    // Sum distance over consecutive stops of each leg.
    let stops: HashMap<&str, &Stop> = g.stops.iter().map(|s| (s.id.as_str(), s)).collect();
    let mut km = 0.0;
    for leg in &legs {
        for w in leg.stop_ids.windows(2) {
            let pa = stops.get(w[0].as_str()).copied().unwrap();
            let pb = stops.get(w[1].as_str()).copied().unwrap();
            km += haversine_km_stop(pa, pb);
        }
    }
    (legs, round(km, 4))
}

fn fare_of(legs: &[Leg], g: &Graph) -> f64 {
    let stops: HashMap<&str, &Stop> = g.stops.iter().map(|s| (s.id.as_str(), s)).collect();
    let mut km = 0.0;
    for leg in legs {
        for w in leg.stop_ids.windows(2) {
            let pa = stops.get(w[0].as_str()).copied().unwrap();
            let pb = stops.get(w[1].as_str()).copied().unwrap();
            km += haversine_km_stop(pa, pb);
        }
    }
    km = round(km, 3);
    // Default LTFRB params (fixture fare is present on routes).
    let fare = g.routes[0].fare.clone().unwrap_or(Fare { base_fare: 13.0, base_dist_km: 4.0, rate_per_km: 1.8 });
    round(fare.base_fare + (km - fare.base_dist_km).max(0.0) * fare.rate_per_km, 2)
}

/// Compute a route between two points (mirrors model.computeRoute).
pub fn compute_route(
    g: &Graph,
    origin: &Point,
    destination: &Point,
    restricted: &[String],
) -> RouteResult {
    let built = build_graph(g);
    let o = nearest_stop(g, origin);
    let d = nearest_stop(g, destination);
    let (Some(o), Some(d)) = (o, d) else {
        return RouteResult { found: false, legs: None, transfers: None, walk_m: None, distance_km: None, fare: None };
    };
    let banned: std::collections::HashSet<String> = restricted.iter().cloned().collect();
    let seg = dijkstra(g, &built, &o, &d, &banned);
    let Some((legs, dist_km, _)) = seg else {
        return RouteResult { found: false, legs: None, transfers: None, walk_m: None, distance_km: None, fare: None };
    };
    // Merge + count transfers after merging.
    let mut merged: Vec<Leg> = Vec::new();
    for leg in legs {
        if let Some(last) = merged.last_mut() {
            if last.route_id == leg.route_id && last.direction_id == leg.direction_id {
                last.stop_ids.extend(leg.stop_ids.into_iter().skip(1));
                continue;
            }
        }
        merged.push(leg);
    }
    let transfers = merged
        .windows(2)
        .filter(|w| w[0].route_id != w[1].route_id)
        .count() as u64;
    let leg_fares = merged
        .iter()
        .map(|leg| {
            // Per-leg LTFRB from the leg's own distance.
            let stops: HashMap<&str, &Stop> = g.stops.iter().map(|s| (s.id.as_str(), s)).collect();
            let mut km = 0.0;
            for w in leg.stop_ids.windows(2) {
                let pa = stops.get(w[0].as_str()).copied().unwrap();
                let pb = stops.get(w[1].as_str()).copied().unwrap();
                km += haversine_km_stop(pa, pb);
            }
            km = round(km, 3);
            let fare = g.routes[0]
                .fare
                .clone()
                .unwrap_or(Fare { base_fare: 13.0, base_dist_km: 4.0, rate_per_km: 1.8 });
            round(fare.base_fare + (km - fare.base_dist_km).max(0.0) * fare.rate_per_km, 2)
        })
        .collect::<Vec<f64>>();
    // JS parity: total = round(sum of per-leg fares, 2).
    let fare_total = round(leg_fares.iter().sum::<f64>(), 2);
    RouteResult {
        found: true,
        legs: Some(merged),
        transfers: Some(transfers),
        walk_m: Some(0.0),
        distance_km: Some(round(dist_km, 3)),
        fare: Some(FareOutput { total: fare_total, legs: leg_fares, discounted: false }),
    }
}

/// Nearest stop id within 50 m (tolerance in km).
fn nearest_stop(g: &Graph, p: &Point) -> Option<String> {
    let mut best: Option<(&Stop, f64)> = None;
    for s in &g.stops {
        let d = haversine_km(p, &Point { lng: s.lng, lat: s.lat });
        if best.map_or(true, |(_, bd)| d < bd) {
            best = Some((s, d));
        }
    }
    best
        .filter(|(_, d)| *d <= 0.05)
        .map(|(s, _)| s.id.clone())
}

fn proj_segment(p: &Point, a: &Point, b: &Point) -> Point {
    let abx = b.lng - a.lng;
    let aby = b.lat - a.lat;
    let apx = p.lng - a.lng;
    let apy = p.lat - a.lat;
    let len2 = abx * abx + aby * aby;
    let mut t = if len2 == 0.0 { 0.0 } else { (apx * abx + apy * aby) / len2 };
    t = t.max(0.0).min(1.0);
    Point { lng: a.lng + t * abx, lat: a.lat + t * aby }
}

/// Multi-candidate snap of a point to all direction polylines.
pub fn snap_point(g: &Graph, p: &Point, tolerance_m: f64) -> Option<SnapResult> {
    let mut best: Option<SnapResult> = None;
    for rt in &g.routes {
        for dir in &rt.directions {
            let snapped = snap_direction(dir.id.clone(), &dir.polyline, p, tolerance_m);
            if let Some(sn) = snapped {
                let better = match &best {
                    None => true,
                    Some(b) => sn.distance_m < b.distance_m
                        || (sn.distance_m == b.distance_m && sn.direction_id < b.direction_id),
                };
                if better {
                    best = Some(sn);
                }
            }
        }
    }
    best
}

pub fn snap_direction(dir_id: String, polyline: &[Point], p: &Point, tolerance_m: f64) -> Option<SnapResult> {
    let mut best_dist = f64::INFINITY;
    let mut best_lng = 0.0;
    let mut best_lat = 0.0;
    for v in polyline {
        let d = haversine_km(p, v) * 1000.0;
        if d < best_dist {
            best_dist = d;
            best_lng = v.lng;
            best_lat = v.lat;
        }
    }
    for w in polyline.windows(2) {
        let proj = proj_segment(p, &w[0], &w[1]);
        let d = haversine_km(p, &proj) * 1000.0;
        if d < best_dist {
            best_dist = d;
            best_lng = proj.lng;
            best_lat = proj.lat;
        }
    }
    if best_dist > tolerance_m {
        return None;
    }
    Some(SnapResult {
        direction_id: dir_id,
        position_on_polyline: Point {
            lng: (best_lng * 100000.0).round() / 100000.0,
            lat: (best_lat * 100000.0).round() / 100000.0,
        },
        distance_m: round(best_dist, 3),
    })
}
