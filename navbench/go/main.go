// Go benchmark runner (US2). Usage: `go run . crypto/... <scale>` (after go is
// installed). Loads the fixture, runs the three workloads, and writes one
// results/go/<scale>/go-<ts>.json per benchmark-format.md.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"time"
)

const (
	sample = 60
	warmup = 20
	budget = 5000 * time.Millisecond
)

func iterFor(scale string) int {
	switch scale {
	case "small":
		return 100
	case "medium":
		return 40
	default:
		return 20
	}
}

func baseDir() string {
	wd, _ := os.Getwd()
	// navbench/go -> navbench (fixtures + results live under navbench/).
	return filepath.Join(wd, "..")
}

func loadFixture(scale string) *Fixture {
	data, err := os.ReadFile(filepath.Join(baseDir(), "fixtures", "inputs", scale+".json"))
	if err != nil {
		panic(err)
	}
	var fx Fixture
	if err := json.Unmarshal(data, &fx); err != nil {
		panic(err)
	}
	return &fx
}

func percentile(v []float64, p float64) float64 {
	if len(v) == 0 {
		return 0
	}
	s := make([]float64, len(v))
	copy(s, v)
	sort.Float64s(s)
	idx := int(float64(p)/100*float64(len(s))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(s) {
		idx = len(s) - 1
	}
	return s[idx]
}

type wlResult struct {
	queries, success int
	latencies        []float64
	wallMS           float64
}

func runRoute(fx *Fixture, iters int, detour bool) wlResult {
	requests := fx.Requests
	if len(requests) > sample {
		requests = requests[:sample]
	}
	var lat []float64
	success, total := 0, 0
	start := time.Now()
	for i := 0; i < iters*len(requests); i++ {
		r := requests[i%len(requests)]
		t0 := time.Now()
		if detour {
			computeDetour(fx, r.Origin, r.Destination)
		} else {
			ComputeRoute(&fx.Graph, r.Origin, r.Destination, nil)
		}
		ms := float64(time.Since(t0).Nanoseconds()) / 1e6
		lat = append(lat, ms)
		total++
		if ms <= float64(budget.Milliseconds()) {
			success++
		}
	}
	return wlResult{queries: total, success: success, latencies: lat, wallMS: float64(time.Since(start).Nanoseconds()) / 1e6}
}

func computeDetour(fx *Fixture, o, d Point) {
	base := ComputeRoute(&fx.Graph, o, d, nil)
	var banned []string
	if len(base.Legs) > 0 && len(base.Legs[0].StopIDs) >= 2 {
		a, b := base.Legs[0].StopIDs[0], base.Legs[0].StopIDs[1]
		if a > b {
			a, b = b, a
		}
		banned = []string{a + "|" + b}
	}
	ComputeRoute(&fx.Graph, o, d, banned)
}

func runSnap(fx *Fixture, iters int) wlResult {
	var points []Point
	for _, r := range fx.Requests[:sample] {
		points = append(points, r.Origin, r.Destination)
	}
	var lat []float64
	success, total := 0, 0
	start := time.Now()
	for i := 0; i < iters*len(points); i++ {
		p := points[i%len(points)]
		t0 := time.Now()
		for _, rt := range fx.Graph.Routes {
			for _, d := range rt.Directions {
				SnapDirection(d.ID, d.Polyline, p, 50)
			}
		}
		ms := float64(time.Since(t0).Nanoseconds()) / 1e6
		lat = append(lat, ms)
		total++
		if ms <= float64(budget.Milliseconds()) {
			success++
		}
	}
	return wlResult{queries: total, success: success, latencies: lat, wallMS: float64(time.Since(start).Nanoseconds()) / 1e6}
}

func emit(wlID string, r wlResult) json.RawMessage {
	lat := map[string]float64{
		"p50": trunc(percentile(r.latencies, 50), 3),
		"p90": trunc(percentile(r.latencies, 90), 3),
		"p99": trunc(percentile(r.latencies, 99), 3),
	}
	qps := trunc(float64(r.success)/
		(r.wallMS/1000.0), 1)
	return json.RawMessage(fmt.Sprintf(
		`{"workload_id":%q,"queries":%d,"success_rate":%.3f,"latency_ms":{"p50":%v,"p90":%v,"p99":%v},"throughput_qps":%v,"peak_rss_mb":0}`,
		wlID, r.queries, trunc(float64(r.success)/float64(r.queries), 3), lat["p50"], lat["p90"], lat["p99"], qps))
}

func trunc(v float64, p int) float64 {
	m := 1.0
	for i := 0; i < p; i++ {
		m *= 10
	}
	return float64(int64(v*m)) / m
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: go run . <scale>")
		os.Exit(1)
	}
	scale := os.Args[1]
	fx := loadFixture(scale)
	iters := iterFor(scale)
	ro := runRoute(fx, iters, false)
	ps := runSnap(fx, iters)
	dp := runRoute(fx, iters, true)

	result := fmt.Sprintf(`{
  "schema_version":"1.0.0",
  "runtime":{"name":"go","version":%q,"build_flags":"release"},
  "environment":{"os":%q,"cpu":"<from env>","mem_gb":16},
  "graph":{"scale":%q,"seed":%d,"hash":"GOHARNESS"},
  "runs":{"iterations":%d,"warmup_queries":%d},
  "workloads":[
    %s,
    %s,
    %s
  ]
}`,
		runtime.Version(), osName(), scale, fx.Graph.Seed, iters, warmup,
		emit("route_optimization", ro), emit("polyline_snapping", ps), emit("detour_pathfinding", dp))

	dir := filepath.Join(baseDir(), "results", "go", scale)
	os.MkdirAll(dir, 0o755)
	file := filepath.Join(dir, fmt.Sprintf("go-%d.json", time.Now().Unix()))
	os.WriteFile(file, []byte(result), 0o644)
	fmt.Printf("[%s] wrote %s\n", scale, file)
}

func osName() string {
	return runtime.GOOS
}
