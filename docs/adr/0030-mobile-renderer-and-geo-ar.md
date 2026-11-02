# ADR-0030: Mobile renderer and Geo-AR — MapLibre on both surfaces (DECIDED)

- **Status**: DECIDED — implementation not started; the AR surface depends on M6's navigation contract
- **Date**: 2026-10-30
- **Supersedes**: ADR-0013's statement that mobile uses `@rnmapbox/maps`. **Relates to**: ADR-0026
  (service area), ADR-0027 (Dataset Version), ADR-0028 (geometry quality), ADR-0029 (no vendor token).

## Context

ADR-0013 says "the product standardized on Mapbox elsewhere (mobile uses `@rnmapbox/maps`)". That is not
true of the repository: `apps/mobile` contains no map library at all — no Mapbox, no MapLibre — only an
Expo starter shell. ADR-0016 repeats the claim when it says a Mapbox account is "already required" on
mobile. Both statements describe an intention, not code, so the renderer decision is still open.

The AR objective is not open. The thesis commits to **location-based Geo-AR**: `expo-camera` plus
`expo-sensors`, using GPS, compass heading and device pitch to project a stop marker onto the camera
feed, and explicitly **not** ARCore, ARKit or surface detection. AR is available only while walking to a
stop or transferring between stops; never during a ride, never in route overview. The documented
pipeline takes the user's position, heading and tilt, the camera feed, and the target stop's
coordinates, and computes a screen position from the relative bearing and the camera's field of view.
The stop schema already carries what an AR marker needs (`ar_marker_enabled`, `landmark_hint`).

`docs/CRITIQUE.md` proposes an acceptance metric of **≤5° angular error at 50 m** and warns that raw
sensor fusion without filtering is the risk in this design.

Three constraints shape the decision. **AR does not use the map renderer** — it is a full-screen camera
surface with a 2D HUD, so Mapbox buys nothing for it. **Mapbox's AR Navigation is ARCore/ARKit-based**,
the technology the thesis forbids, so adopting Mapbox would not shorten the AR path. **Both candidate
renderers are native modules**, so either way the app needs an Expo development build rather than Expo
Go.

## Decision

1. **MapLibre on mobile as well as admin.** Mobile uses `@maplibre/maplibre-react-native` with the same
   style and tile sources as the admin (OpenFreeMap, or the self-hosted alternative when that decision
   lands). One style, one coordinate convention, no token anywhere in the product.

2. **AR is Geo-AR only.** Camera feed, location, compass and motion sensors; no ARCore, no ARKit, no
   surface/plane detection, no 3D engine, no vendor AR SDK. This is a thesis constraint, not a
   preference, and it is recorded here so a later "just use the AR SDK" suggestion has an answer.

3. **AR consumes navigation Steps, not raw route geometry.** M6 defines the navigation response in
   `@komyuter/shared`, using the glossary's existing Step vocabulary (`walk`, `board`, `ride`, `alight`,
   `transfer`). Each Step carries its geometry, its target stop when one exists, its distance, and an
   **`ar_eligible` flag computed by the server** from the Step's mode. AR opens only for `walk` and
   `transfer` Steps, and only when the flag is true. The client never infers eligibility, for the same
   reason it does not compute fares.

4. **AR points at the next stop or transfer, not at a turn.** The marker shows direction, distance and
   the stop's `landmark_hint`. There is no turn-by-turn instruction and no ETA (ADR-0009). This keeps the
   projection problem two-dimensional and matches the actual objective: help a commuter find the
   boarding point.

5. **Sensors are fused and quality-gated.** Position comes from `expo-location`; heading prefers the
   location subsystem's true/magnetic heading with its accuracy over a raw magnetometer reading, with
   magnetic declination applied; pitch and roll come from `expo-sensors` motion. Heading is filtered
   (complementary or Madgwick-class), averaged as a circular quantity, and accompanied by a quality
   score. Poor accuracy, high variance or extreme tilt switches the surface to a calibration state and
   offers the map as the fallback; AR never silently shows a confident wrong direction.

6. **Camera field of view is calibrated, not assumed.** `expo-camera` does not expose lens intrinsics, so
   a per-device calibration factor (keyed by device model) is part of the feature. Without it, a good
   heading can still place the marker at the wrong screen coordinate.

7. **The HUD runs off the React render loop.** Sensor-rate updates are applied on the UI thread through
   Reanimated worklets (already a dependency); React state changes only when the Step or AR mode changes.

8. **The acceptance metric is heading/bearing error.** AR meets **≤5° at 1σ at 50 m under stated
   open-sky conditions**, measured over at least 30 samples against a surveyed bearing, with the test
   protocol written down. It is deliberately not a marker-placement metric: a 10 m GPS fix at 50 m
   already consumes the whole budget, so promising pixel placement would be a claim the system cannot
   keep. Field results are reported as measured, including failures.

9. **AR is gated by the same two boundaries as everything else.** It is unavailable outside the Service
   Area (ADR-0026), and it pins the navigation session's Dataset Version (ADR-0027). Offline, the
   current session's Steps, the Service Area polygon and an offline tile pack are available; a version
   change is picked up between sessions, not mid-walk.

10. **Geometry math lives in `@komyuter/shared`.** Bearing, relative bearing, projection to screen
    coordinates, circular mean and haversine distance are pure functions, dependency-free, and tested in
    the existing node-environment suite. The server, the mobile AR surface and the M6 admin playground
    all use the same implementation, so the bearing shown in the playground is the bearing the phone
    computes.

11. **Mobile is an EAS development build from the first map screen.** `expo-camera`, `expo-sensors`,
    `expo-location`, `expo-device`, `expo-keep-awake`, `expo-screen-orientation` and the MapLibre config
    plugin are added to `app.json` together; Expo Go is no longer a supported development path.

## Alternatives considered

- **Mapbox on mobile, MapLibre in admin.** Rejected: two renderers, two style languages, two token
  stories and visible drift between what the plotter draws and what the commuter sees. AR gains nothing,
  because Mapbox's AR path is out of scope.
- **ARCore/ARKit or Mapbox AR Navigation.** Rejected by the thesis's stated approach, and it would add a
  vendor and a device-support matrix for a problem that GPS plus compass already addresses outdoors.
- **A WebView or hybrid AR surface.** Rejected: the camera and sensor access paths are worse, and the
  projection still has to be written by hand.
- **Derive `ar_eligible` on the client.** Rejected: it duplicates a rule the server already knows, and a
  client bug could open the camera during a ride, violating a stated constraint.
- **Promise ≤5° marker placement.** Rejected as unmeasurable with consumer GPS; the metric is worded
  against heading error, which is what the sensor stack actually controls.
- **Defer the renderer decision until the first screen.** Rejected: the choice determines the style
  contract, the token policy and the build pipeline, and it is cheapest to record before any mobile map
  code exists.

## Consequences

- **Positive**: one style definition and one coordinate convention across admin and mobile; no token,
  no billing, no vendor in the commuter app; offline packs and a self-hosted basemap remain possible.
- **Positive**: AR's success criterion becomes a measurement rather than a demo impression, and the
  shared math makes that measurement repeatable without a phone.
- **Trade-off**: mobile cannot use Expo Go; every developer needs an EAS build, and native dependency
  bumps become a real maintenance task.
- **Trade-off**: FOV calibration and heading-quality gating are additional screens and states, not
  polish that can be skipped.
- **Risk**: MapLibre React Native v11 supports only React Native's new architecture and requires RN
  ≥ 0.80. The repository's Expo 56 / RN 0.85 line satisfies that on paper; the exact release must be
  verified before pinning.
- **Risk**: consumer compass accuracy near vehicles and metal can exceed the budget regardless of
  filtering. The fallback and the "hold steady" state are the honest answer, and the thesis must report
  the failure rate.
- **Risk**: AR cannot be built before M6 defines the Step contract. Sequencing is a dependency, not a
  preference.

## Non-goals (explicit)

- No plane detection, world anchoring, occlusion or 3D models.
- No AR during ride Steps, and no AR in route overview.
- No turn-by-turn instructions, lane guidance or ETA (ADR-0009).
- No map renderer abstraction with two live implementations; feature code simply must not import
  MapLibre types directly, so a future swap stays a module change.
- No AR in the admin dashboard.
