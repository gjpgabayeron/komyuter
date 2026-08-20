// Parity test for the Go harness (FR-010 / SC-005). Asserts this runtime
// reproduces the canonical oracle's navigational invariants. Runnable with
// `go test ./...` in the navbench/go dir.
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type oracleCase struct {
	Input struct {
		WorkloadID string `json:"workload_id"`
		Request    struct {
			Origin              *Point   `json:"origin"`
			Destination         *Point   `json:"destination"`
			DirectionID         *string  `json:"direction_id"`
			Point               *Point   `json:"point"`
			ToleranceM          *float64 `json:"tolerance_m"`
			RestrictedSegmentID *string  `json:"restricted_segment_id"`
		} `json:"request"`
	} `json:"input"`
	ExpectedOutput json.RawMessage `json:"expected_output"`
}

func testBaseDir() string {
	// Go tests run from the package dir (navbench/go); fixtures + results live
	// one level up under navbench/.
	wd, _ := os.Getwd()
	return filepath.Join(wd, "..")
}

func loadFixtureTest(t *testing.T, scale string) *Fixture {
	data, err := os.ReadFile(filepath.Join(testBaseDir(), "fixtures", "inputs", scale+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var fx Fixture
	if err := json.Unmarshal(data, &fx); err != nil {
		t.Fatal(err)
	}
	return &fx
}

func loadOracle(t *testing.T, scale string) []oracleCase {
	data, err := os.ReadFile(filepath.Join(testBaseDir(), "fixtures", "oracle", scale+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []oracleCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	return cases
}

func assertInvariants(t *testing.T, actual RouteResult, expected json.RawMessage, ctx string) {
	var exp struct {
		Found      bool        `json:"found"`
		Transfers  *uint64     `json:"transfers"`
		WalkM      *float64    `json:"walk_m"`
		DistanceKm *float64    `json:"distance_km"`
		Fare       *FareOutput `json:"fare"`
	}
	json.Unmarshal(expected, &exp)
	if actual.Found != exp.Found {
		t.Fatalf("[%s] found mismatch: got %v want %v", ctx, actual.Found, exp.Found)
	}
	if !exp.Found {
		return
	}
	if *actual.DistanceKm != *exp.DistanceKm {
		t.Fatalf("[%s] distance_km mismatch: got %v want %v", ctx, *actual.DistanceKm, *exp.DistanceKm)
	}
	if *actual.Transfers != *exp.Transfers {
		t.Fatalf("[%s] transfers mismatch: got %v want %v", ctx, *actual.Transfers, *exp.Transfers)
	}
	if *actual.WalkM != *exp.WalkM {
		t.Fatalf("[%s] walk_m mismatch: got %v want %v", ctx, *actual.WalkM, *exp.WalkM)
	}
	if actual.Fare.Total != exp.Fare.Total {
		t.Fatalf("[%s] fare.total mismatch: got %v want %v", ctx, actual.Fare.Total, exp.Fare.Total)
	}
}

func TestParityAllScales(t *testing.T) {
	for _, scale := range []string{"small", "medium", "large", "rush"} {
		fx := loadFixtureTest(t, scale)
		cases := loadOracle(t, scale)
		for _, c := range cases {
			req := c.Input.Request
			switch c.Input.WorkloadID {
			case "route_optimization":
				got := ComputeRoute(&fx.Graph, *req.Origin, *req.Destination, nil)
				assertInvariants(t, got, c.ExpectedOutput, "route_optimization")
			case "detour_pathfinding":
				banned := detourSeg(fx, *req.Origin, *req.Destination)
				got := ComputeRoute(&fx.Graph, *req.Origin, *req.Destination, banned)
				assertInvariants(t, got, c.ExpectedOutput, "detour_pathfinding")
			case "polyline_snapping":
				dirs := SortedDirections(&fx.Graph)
				for _, d := range dirs {
					if d.ID == *req.DirectionID {
						got := SnapDirection(d.ID, d.Polyline, *req.Point, *req.ToleranceM)
						checkSnap(t, got, c.ExpectedOutput, scale)
					}
				}
			}
		}
	}
}

func detourSeg(fx *Fixture, o, d Point) []string {
	base := ComputeRoute(&fx.Graph, o, d, nil)
	if len(base.Legs) == 0 || len(base.Legs[0].StopIDs) < 2 {
		return nil
	}
	a := base.Legs[0].StopIDs[0]
	b := base.Legs[0].StopIDs[1]
	if a > b {
		a, b = b, a
	}
	return []string{a + "|" + b}
}

func checkSnap(t *testing.T, got *SnapResult, expected json.RawMessage, scale string) {
	var exp *SnapResult
	json.Unmarshal(expected, &exp)
	if got == nil && exp == nil {
		return
	}
	if got == nil || exp == nil {
		t.Fatalf("[snap %s] null mismatch: got %v want %v", scale, got != nil, exp != nil)
	}
	if got.DirectionID != exp.DirectionID {
		t.Fatalf("[snap %s] direction_id: got %s want %s", scale, got.DirectionID, exp.DirectionID)
	}
	if got.DistanceM != exp.DistanceM {
		t.Fatalf("[snap %s] distance: got %v want %v", scale, got.DistanceM, exp.DistanceM)
	}
	if got.PositionOnPolyline.Lng != exp.PositionOnPolyline.Lng ||
		got.PositionOnPolyline.Lat != exp.PositionOnPolyline.Lat {
		t.Fatalf("[snap %s] position mismatch", scale)
	}
}
