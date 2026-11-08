// Package main in the Go harness. The canonical navigation model (Go port)
// must reproduce the JS oracle's navigational invariants (found, distance_km,
// transfers, walk_m, fare.total) per FR-010 / SC-005.
package main

import (
	"hash/fnv"
	"math"
	"sort"
	"strings"
)

type Point struct {
	Lng float64 `json:"lng"`
	Lat float64 `json:"lat"`
}

type Fare struct {
	BaseFare   float64 `json:"base_fare"`
	BaseDistKm float64 `json:"base_dist_km"`
	RatePerKm  float64 `json:"rate_per_km"`
}

type Stop struct {
	ID  string  `json:"id"`
	Lng float64 `json:"lng"`
	Lat float64 `json:"lat"`
}

type Direction struct {
	ID       string   `json:"id"`
	StopIDs  []string `json:"stopIds"`
	Polyline []Point  `json:"polyline"`
}

type Route struct {
	ID         string      `json:"id"`
	Directions []Direction `json:"directions"`
	Fare       *Fare       `json:"fare,omitempty"`
}

type Graph struct {
	Scale  string  `json:"scale"`
	Seed   uint64  `json:"seed"`
	Center Point   `json:"center"`
	Stops  []Stop  `json:"stops"`
	Routes []Route `json:"routes"`
}

type Fixture struct {
	Graph    Graph `json:"graph"`
	Requests []struct {
		Origin      Point  `json:"origin"`
		Destination Point  `json:"destination"`
		Profile     string `json:"profile"`
	} `json:"requests"`
}

type Leg struct {
	RouteID     string   `json:"route_id"`
	DirectionID string   `json:"direction_id"`
	StopIDs     []string `json:"stop_ids"`
}

type RouteResult struct {
	Found      bool        `json:"found"`
	Legs       []Leg       `json:"legs,omitempty"`
	Transfers  *uint64     `json:"transfers,omitempty"`
	WalkM      *float64    `json:"walk_m,omitempty"`
	DistanceKm *float64    `json:"distance_km,omitempty"`
	Fare       *FareOutput `json:"fare,omitempty"`
}

type FareOutput struct {
	Total      float64   `json:"total"`
	Legs       []float64 `json:"legs"`
	Discounted bool      `json:"discounted"`
}

type SnapResult struct {
	DirectionID        string  `json:"direction_id"`
	PositionOnPolyline Point   `json:"position_on_polyline"`
	DistanceM          float64 `json:"distance_m"`
}

const (
	baseOnBoard   = 13.0
	marginalPerKm = 1.8
	transferCost  = 2.0
)

func haversineKm(a, b Point) float64 {
	const R = 6371.0088
	dLat := (b.Lat - a.Lat) * math.Pi / 180
	dLng := (b.Lng - a.Lng) * math.Pi / 180
	la1 := a.Lat * math.Pi / 180
	la2 := b.Lat * math.Pi / 180
	h := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(la1)*math.Cos(la2)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * R * math.Asin(math.Sqrt(h))
}

func round(x float64, decimals int) float64 {
	f := math.Pow(10, float64(decimals))
	return math.Round(x*f) / f
}

func fnvKey(key string) uint64 {
	h := fnv.New64a()
	h.Write([]byte(key))
	return h.Sum64()
}

type membership struct {
	route string
	dir   string
}

type rideEdge struct {
	route, dir, to string
	km             float64
}

type builtGraph struct {
	byStop   map[string][]membership
	stopRide map[string][]rideEdge
}

func buildGraph(g *Graph) *builtGraph {
	bg := &builtGraph{
		byStop:   map[string][]membership{},
		stopRide: map[string][]rideEdge{},
	}
	for _, rt := range g.Routes {
		for _, dir := range rt.Directions {
			ids := dir.StopIDs
			for i := 0; i < len(ids); i++ {
				bg.byStop[ids[i]] = append(bg.byStop[ids[i]], membership{rt.ID, dir.ID})
				if i+1 < len(ids) {
					a, b := ids[i], ids[i+1]
					km := round(haversineKm(ptOf(g, a), ptOf(g, b)), 4)
					bg.stopRide[a] = append(bg.stopRide[a], rideEdge{rt.ID, dir.ID, b, km})
					bg.stopRide[b] = append(bg.stopRide[b], rideEdge{rt.ID, dir.ID, a, km})
				}
			}
		}
	}
	return bg
}

func ptOf(g *Graph, id string) Point {
	for _, s := range g.Stops {
		if s.ID == id {
			return Point{Lng: s.Lng, Lat: s.Lat}
		}
	}
	return Point{}
}

// heap: binary min-heap on (cost, tie).
type heap struct {
	cost []float64
	tie  []uint64
	key  []string
}

func (h *heap) push(c float64, t uint64, k string) {
	h.cost = append(h.cost, c)
	h.tie = append(h.tie, t)
	h.key = append(h.key, k)
	h.up(len(h.cost) - 1)
}
func (h *heap) len() int { return len(h.cost) }
func (h *heap) less(a, b int) bool {
	return h.cost[a] < h.cost[b] || (h.cost[a] == h.cost[b] && h.tie[a] < h.tie[b])
}
func (h *heap) swap(a, b int) {
	h.cost[a], h.cost[b] = h.cost[b], h.cost[a]
	h.tie[a], h.tie[b] = h.tie[b], h.tie[a]
	h.key[a], h.key[b] = h.key[b], h.key[a]
}
func (h *heap) up(i int) {
	for i > 0 {
		p := (i - 1) >> 1
		if h.less(i, p) {
			h.swap(i, p)
			i = p
		} else {
			break
		}
	}
}
func (h *heap) down(i int) {
	for {
		l, r, s := 2*i+1, 2*i+2, i
		n := h.len()
		if l < n && h.less(l, s) {
			s = l
		}
		if r < n && h.less(r, s) {
			s = r
		}
		if s != i {
			h.swap(i, s)
			i = s
		} else {
			break
		}
	}
}
func (h *heap) pop() (float64, uint64, string, bool) {
	if h.len() == 0 {
		return 0, 0, "", false
	}
	top := h.cost[0]
	ttie := h.tie[0]
	tkey := h.key[0]
	last := h.len() - 1
	h.cost[0], h.tie[0], h.key[0] = h.cost[last], h.tie[last], h.key[last]
	h.cost = h.cost[:last]
	h.tie = h.tie[:last]
	h.key = h.key[:last]
	if h.len() > 0 {
		h.down(0)
	}
	return top, ttie, tkey, true
}

// ComputeRoute mirrors model.computeRoute (JS). Returns the route result with
// the invariant fields a port must reproduce.
func ComputeRoute(g *Graph, origin, destination Point, restricted []string) RouteResult {
	bg := buildGraph(g)
	o := nearestStop(g, origin)
	d := nearestStop(g, destination)
	if o == "" || d == "" {
		return RouteResult{Found: false}
	}
	banned := map[string]bool{}
	for _, s := range restricted {
		banned[s] = true
	}
	legs, distKm, ok := dijkstra(g, bg, o, d, banned)
	if !ok {
		return RouteResult{Found: false}
	}
	// Merge adjacent legs with the same route+direction.
	merged := []Leg{}
	for _, leg := range legs {
		if n := len(merged); n > 0 {
			last := &merged[n-1]
			if last.RouteID == leg.RouteID && last.DirectionID == leg.DirectionID {
				last.StopIDs = append(last.StopIDs, leg.StopIDs[1:]...)
				continue
			}
		}
		merged = append(merged, leg)
	}
	var transfers uint64
	for i := 0; i+1 < len(merged); i++ {
		if merged[i].RouteID != merged[i+1].RouteID {
			transfers++
		}
	}
	legFares := make([]float64, 0, len(merged))
	for _, leg := range merged {
		legFares = append(legFares, legFare(g, leg))
	}
	total := round(sum(legFares), 2)
	distR := round(distKm, 3)
	walk := 0.0
	return RouteResult{
		Found:      true,
		Legs:       merged,
		Transfers:  &transfers,
		WalkM:      &walk,
		DistanceKm: &distR,
		Fare:       &FareOutput{Total: total, Legs: legFares, Discounted: false},
	}
}

func legFare(g *Graph, leg Leg) float64 {
	km := 0.0
	for i := 0; i+1 < len(leg.StopIDs); i++ {
		km += haversineKm(ptOf(g, leg.StopIDs[i]), ptOf(g, leg.StopIDs[i+1]))
	}
	km = round(km, 3)
	base := fareOf(g)
	return round(base.BaseFare+math.Max(0, km-base.BaseDistKm)*base.RatePerKm, 2)
}

func fareOf(g *Graph) Fare {
	if len(g.Routes) > 0 && g.Routes[0].Fare != nil {
		return *g.Routes[0].Fare
	}
	return Fare{BaseFare: 13, BaseDistKm: 4, RatePerKm: 1.8}
}

func sum(v []float64) float64 {
	s := 0.0
	for _, x := range v {
		s += x
	}
	return s
}

func dijkstra(g *Graph, bg *builtGraph, from, to string, banned map[string]bool) ([]Leg, float64, bool) {
	dist := map[string]float64{}
	prev := map[string]string{}
	pq := &heap{}
	seq := uint64(0)

	for _, m := range bg.byStop[from] {
		key := from + "|" + m.route + "|" + m.dir
		if _, ok := dist[key]; !ok {
			dist[key] = baseOnBoard
			pq.push(baseOnBoard, fnvKey(key), key)
		}
	}
	steps := 0
	for pq.len() > 0 {
		cc, _, cur, ok := pq.pop()
		if !ok {
			break
		}
		if cc > dist[cur] {
			continue
		}
		if steps > 2000000 {
			return nil, 0, false
		}
		steps++
		parts := strings.Split(cur, "|")
		cstop, croute, cdir := parts[0], parts[1], parts[2]
		if cstop == to {
			legs, km := reconstruct(g, cur, prev)
			return legs, km, true
		}
		for _, m := range bg.byStop[cstop] {
			if m.route == croute && m.dir == cdir {
				continue
			}
			nk := cstop + "|" + m.route + "|" + m.dir
			nc := cc + transferCost
			if d, exists := dist[nk]; !exists || nc < d {
				dist[nk] = nc
				prev[nk] = cur
				pq.push(nc, seq, nk)
				seq++
			}
		}
		for _, e := range bg.stopRide[cstop] {
			seg := cstop + "|" + e.to
			if e.to < cstop {
				seg = e.to + "|" + cstop
			}
			if banned[seg] {
				continue
			}
			if e.route != croute || e.dir != cdir {
				continue
			}
			nk := e.to + "|" + e.route + "|" + e.dir
			cost := cc + baseOnBoard + marginalPerKm*e.km
			if d, exists := dist[nk]; !exists || cost < d {
				dist[nk] = cost
				prev[nk] = cur
				pq.push(cost, seq, nk)
				seq++
			}
		}
	}
	return nil, 0, false
}

func reconstruct(g *Graph, endKey string, prev map[string]string) ([]Leg, float64) {
	legs := []Leg{}
	cur := endKey
	for cur != "" {
		parts := strings.Split(cur, "|")
		s, r, d := parts[0], parts[1], parts[2]
		if n := len(legs); n > 0 && legs[n-1].RouteID == r && legs[n-1].DirectionID == d {
			l := &legs[n-1]
			l.StopIDs = append([]string{s}, l.StopIDs...)
		} else {
			legs = append(legs, Leg{RouteID: r, DirectionID: d, StopIDs: []string{s}})
		}
		cur = prev[cur]
	}
	// reverse legs
	for i, j := 0, len(legs)-1; i < j; i, j = i+1, j-1 {
		legs[i], legs[j] = legs[j], legs[i]
	}
	km := 0.0
	for _, leg := range legs {
		for i := 0; i+1 < len(leg.StopIDs); i++ {
			km += haversineKm(ptOf(g, leg.StopIDs[i]), ptOf(g, leg.StopIDs[i+1]))
		}
	}
	return legs, round(km, 4)
}

func nearestStop(g *Graph, p Point) string {
	var best *Stop
	bd := math.Inf(1)
	for i := range g.Stops {
		d := haversineKm(p, Point{Lng: g.Stops[i].Lng, Lat: g.Stops[i].Lat})
		if d < bd {
			bd = d
			best = &g.Stops[i]
		}
	}
	if best != nil && bd <= 0.05 {
		return best.ID
	}
	return ""
}

func projSegment(p, a, b Point) Point {
	abx := b.Lng - a.Lng
	aby := b.Lat - a.Lat
	apx := p.Lng - a.Lng
	apy := p.Lat - a.Lat
	len2 := abx*abx + aby*aby
	t := 0.0
	if len2 != 0 {
		t = (apx*abx + apy*aby) / len2
	}
	if t < 0 {
		t = 0
	}
	if t > 1 {
		t = 1
	}
	return Point{Lng: a.Lng + t*abx, Lat: a.Lat + t*aby}
}

// SnapDirection snaps a point to a single direction polyline (oracle parity).
func SnapDirection(dirID string, polyline []Point, p Point, toleranceM float64) *SnapResult {
	bestDist := math.Inf(1)
	var bestLng, bestLat float64
	for _, v := range polyline {
		d := haversineKm(p, v) * 1000
		if d < bestDist {
			bestDist = d
			bestLng, bestLat = v.Lng, v.Lat
		}
	}
	for i := 0; i+1 < len(polyline); i++ {
		pr := projSegment(p, polyline[i], polyline[i+1])
		d := haversineKm(p, pr) * 1000
		if d < bestDist {
			bestDist = d
			bestLng, bestLat = pr.Lng, pr.Lat
		}
	}
	if bestDist > toleranceM {
		return nil
	}
	return &SnapResult{
		DirectionID:        dirID,
		PositionOnPolyline: Point{Lng: math.Round(bestLng*1e5) / 1e5, Lat: math.Round(bestLat*1e5) / 1e5},
		DistanceM:          round(bestDist, 3),
	}
}

// SortedDirections returns direction polylines in a stable order (for tests).
func SortedDirections(g *Graph) []struct {
	ID       string
	Polyline []Point
} {
	dirs := []struct {
		ID       string
		Polyline []Point
	}{}
	for _, rt := range g.Routes {
		for _, d := range rt.Directions {
			dirs = append(dirs, struct {
				ID       string
				Polyline []Point
			}{d.ID, d.Polyline})
		}
	}
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].ID < dirs[j].ID })
	return dirs
}
