# Product

<!-- impeccable:product-schema 1 -->

## Register

product

## Platform

adaptive

## Users

Two distinct actors, two surfaces:

- **Commuters** (mobile app, Expo). Students, workers, and tourists navigating Iloilo City Proper + Oton/Pavia/Leganes by PUJ jeepney. Primary context: mid-journey, one hand on the phone, street-level heat and glare, low tolerance for friction. Tourists in particular are unfamiliar with Iloilo's unmarked, unsignposted boarding culture. Job to be done: find a boarding point, choose a route, know the exact fare, and execute the journey.
- **Administrators** (web dashboard). Authorized staff maintaining the transit dataset: routes, directions, stops, polylines, detours, and LTFRB fare configurations. Primary context: desktop, map-focused data curation. Work is event-driven (route changes, rate updates) rather than continuous.

## Product Purpose

Komyuter is an undergraduate thesis (ISATU) that builds the first digitized PUJ transit system for Iloilo: a multi-criteria Dijkstra router (distance, fare, transfers, walk) plus a location-based Geo-AR wayfinder for the last-meter to unmarked boarding points. It exists because no digitized route map exists (LPTRP data lives only in PDFs), commuters must trade off competing routing criteria, and tourists cannot find physical boarding points. Success is measured by PSSUQ usability (target mean ≤ 3.0, industry benchmark 2.82) across 25–30 respondents: a trustworthy, usable system — not a research artifact.

## Brand Personality

Friendly & approachable — a helpful local companion, not a cold corporate entity. Dynamic & active — the striding form and raised hand convey action, movement, and efficiency. Authentically Filipino — rooted in the everyday Philippine commuting experience: reliable, adaptive, street-smart. Technologically modern — clean lines and flat color signal a digital-first, app-driven service.

## Brand Commitments

- **Name:** Komyuter (derived from "commuter").
- **Logo:** a minimalist, abstract lowercase "k" constructed from three rounded, pill-shaped strokes in a single solid cerulean blue, separating the hailing passenger (top floating pill + central angular body) from the incoming vehicle or road (lower diagonal stroke) while unifying them in one color.
- **Primary color:** `#4A90D9` — soft, trustworthy cerulean blue; conveys reliability, mobility, and modern tech.
- **Background:** white (`#FFFFFF`) for maximum contrast and clarity.
- **Logo geometry:** pill-shaped (capsule) ends with a consistent, uniform stroke width.
- **Typography (implied):** clean, modern sans-serif to complement the rounded icon.
- **Aesthetic:** minimalist, friendly, approachable, culturally resonant, and modern — never harsh or industrial.

## Anti-references

- **Generic SaaS dashboard.** Gray-on-white admin chrome, card-grid KPI dashboards, side-stripe accents. The admin surface is map-first; the map is the interface, not a widget on a dashboard.
- **Megacity gig-app styling.** Neon, oversaturated Grab-style UI is wrong for a provincial secondary city. Scale the design to Iloilo: calm, legible, everyday.
- **Tourist-app novelty.** Cartoonish or gimmicky wayfinding. This is a daily tool for workers and students first; the tourist use case is served by the same serious interface.
- **Transit signal clichés.** Harsh yellow-on-black "transport" branding and clip-art bus iconography.

## Design Principles

1. **Precision is trust.** Every displayed number is exact — fares, distances, walk meters, transfers. Never fabricate (no ETAs, ever). The system earns trust by being honest about what it knows and legible about what it doesn't.
2. **Map-native, not form-native.** The map is the primary canvas on both surfaces: admins draw routes on it, commuters pick origin/destination on it. Never bury the map under forms.
3. **Glanceable under duress.** Commuters read the app mid-journey, one-handed, in outdoor glare. Hierarchy must survive at arm's length in full sun.
4. **Reassure through the unknown.** Hail-and-ride boarding, missing signage, and detours are the norm, not the exception. Surface the uncertainty ("walk 85 m to boarding point") instead of hiding it behind a clean facade.
5. **Local scale.** Design for a mid-size secondary city with uneven connectivity: offline-tolerant patterns (traces queue locally for upload), provincial pacing, not megacity complexity.

## Accessibility & Inclusion

- WCAG AA: body text ≥ 4.5:1, large text ≥ 3:1; visible focus states; touch targets ≥ 44px; `prefers-reduced-motion` respected.
- Outdoor readability: high-contrast map elements, no information conveyed by color alone, text readable in glare.
- Mobile surface is primary on Android, one-handed use.
