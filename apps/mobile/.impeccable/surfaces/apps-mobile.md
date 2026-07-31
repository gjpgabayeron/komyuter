---
version: 1
slug: "apps-mobile"
primary_target: "apps/mobile"
related_targets: ["apps/web"]
---

# Commuter App — Surface Brief

## Scope and mode

First surface to build: the commuter mobile app (Expo/React Native). Visitor mode: **Operate**. The admin dashboard (apps/web) is a related target reusing the same visual world.

## Audience, job, and task

Iloilo students, workers, and tourists riding PUJ jeepneys. Primary task: find a boarding point, choose a route, know the exact fare, and execute the journey — one-handed, in midday glare.

## Proof and content

The unmarked, unsignposted jeepney network is navigable: every boarding point findable (hail-and-ride snapping, Geo-AR markers), every fare exact (LTFRB formula), every route trustworthy (informational trust badges). No ETAs, ever — distances, fares, transfers, and walk meters only.

## Chosen direction and memorable moment

**The Route Sign.** The AR wayfinding moment is the signature: sign plates naming the boarding point and its distance mount into the camera view ("SM CITY · 85m") as the commuter approaches. The journey itself reads as a sequence of mounted route signs.

## Constraints

- WCAG AA; outdoor glare readability; touch targets ≥ 44px.
- Android primary, one-handed.
- Plate grammar: ≤ 4px corners, no shadows, pure white ground, green-blue + signal amber.
- Reduced motion respected.

## Unresolved decisions

- Exact typefaces (condensed heavy route voice, workhorse sans) — resolve at implementation.
- Exact OKLCH palette values — confirm from the seed candidates.
- Whether the Geo-AR plate overlays composite or replace the camera frame.
