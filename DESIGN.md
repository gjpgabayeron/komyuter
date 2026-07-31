## <!-- SEED: established with the user before implementation; re-run $impeccable document once there's code to capture the actual tokens and components. -->

name: Komyuter
description: Iloilo PUJ transit navigation — multi-criteria routing and Geo-AR wayfinding with admin-managed route data

---

# Design System: Komyuter

## Overview

**Creative North Star: "The Route Sign"**

Komyuter's interface speaks the street language every Filipino commuter reads without thinking: the rectangular enamel route signs — white bold condensed lettering on deep green-blue — that name every route, terminal, and barangay in the Philippines. The world commits to signage as the interface: wayfinding that literally _is_ signage. Every journey reads as a sequence of mounted route signs — "SM CITY", "JARO", "CALAPARAN" — sitting on a pure white page that stays calm under tropical glare.

The register is product: commuters operate it mid-journey one-handed in full sun, admins operate it at a desk. That dual audience sets the density — glanceable plates, nothing decorative, no chrome. The system is efficient and official the way a route sign is: it tells you exactly what it means in the fewest words. Warmth is carried by the destinations themselves, never by ornament.

Motion is functional and mechanical: sign plates mount into place with a quick, decisive snap. Reduced motion is the default posture for this world — a sign does not animate; it simply appears and is read.

**Key Characteristics:**

- Plate surfaces carry all information: destinations, routes, fares, and states are enamel plates, never chrome cards.
- Pure white ground, flat enamel world — no drop shadows, no glass, hard corners only.
- Signboard green-blue is the committed color for primary actions and active route state; signal amber is reserved for hail/attention.
- Block-capital condensed lettering names places; a quiet workhorse sans carries body copy.
- Glare-legible at arm's length: everything a commuter needs survives midday sun.

## Colors

The palette is the Philippine road-sign enamel world: a pure white road surface, signboard green-blue, signal amber, and asphalt-ink. Values below are provisional seed candidates, set directionally with the world; confirm exact OKLCH at implementation and record them in the frontmatter on the first `$impeccable document` run.

### Primary

- **Signboard Green-Blue** (oklch(0.52 0.13 235)): primary buttons, active route state, plate fills, selected route on the map. White text on saturated fills.

### Accent

- **Signal Amber** (oklch(0.78 0.14 70)): the hail state, active boarding, and anything that needs attention — a signal light at the corner. Dark ink text on amber fills, exactly as real warning signs carry black lettering.

### Neutral

- **Road White** (oklch(1.000 0.000 0)): the page ground. Pure white — no warmth smuggled in; the brand lives in the plates, not the surface.
- **Sign Steel** (oklch(0.965 0.006 225)): cards and panels pulled a whisper toward the sign hue.
- **Plate Ink** (oklch(0.23 0.02 230)): body text, ≥ 7:1 against Road White.
- **Sign Gray** (oklch(0.50 0.02 230)): secondary text and dividers, ≥ 4.5:1 against Road White.

### Named Rules

**The Enamel Rule.** Every information surface is a sign plate: hard corners (≤ 4px), a thin dark border, flat fill. No drop shadows, no glass, no ghost-card borders.

## Typography

The pairing works on the contrast axis of function: monumental block capitals for the places you travel to, a quiet workhorse sans for the instructions that get you there.

**Route voice:** a heavy, condensed, block-capital grotesk for destinations, route names, and plate headlines — the lettering of a painted route sign. [to be resolved during implementation; candidates are condensed heavy grotesks with visible weight, not display serifs]
**Body voice:** a workhorse sans, system-grade. [to be resolved during implementation; Roboto-class on Android, a system stack on the web]
**Numbers:** fares, distances, and walk meters use tabular figures so columns of fares line up like a published fare table.

### Hierarchy

- **Route Display** (heavy condensed caps, large clamp): destination names and plate headlines. The only voice that shouts — a sign names one thing at a time.
- **Title** (semibold sans, ~1.25rem): route names, stop names, screen headings.
- **Body** (regular sans, 1rem / 1.5): instructions, step descriptions. Cap line length at ~65ch.
- **Label** (medium sans, 0.8125rem, tabular numbers): fares, distances, meter counts, metadata. Precision is displayed as labels, not decoration.

### Named Rules

**The One-Destination Rule.** A plate names one destination or one quantity. Two facts in one plate is a sign nobody reads.

## Layout

The spatial grammar is the mounted-plate: content is composed as rectangular plates on a pure white page, grouped with clear horizontal rules rather than floating cards. Destinations stack left-aligned in reading order; fares and distances sit as small plates at the right edge, aligned like a fare table. Grid is consistent and unbroken — nothing is centered for drama, everything is aligned like lettering on a sign.

On the map surfaces (both commuter and admin), the map is the primary canvas; plates overlay it as deliberate panels, never covering more than a corner. Responsive behavior is plate-reflow: plates keep their rectangular integrity and stack on narrow widths, the grid breaking cleanly at whole-plate widths.

## Elevation & Depth

Flat, explicitly and without exception. This is an enamel world: sign plates sit flush against the surface with a thin border, never a shadow. Depth is conveyed by border weight and plate color only. There is no elevation stack; the deepest layer is the page, and the most prominent surface is a filled signboard plate.

### Named Rules

**The No-Shadow Rule.** No drop shadows anywhere. A plate's edge is drawn with a border, not darkness.

## Shapes

Hard corners everywhere. Plates and buttons use ≤ 4px radius; small tags and chips may use the same ≤ 4px. No pill shapes except where a physical sign would be rounded (none). Forms are rectangular fields with a flat stroke, like a sign waiting to be painted. The recurring silhouette is the rectangle with a thin border — the plate is the shape of the system.

## Do's and Don'ts

### Do:

- **Do** present destinations, routes, fares, and states as flat sign plates with a thin dark border and hard corners.
- **Do** set primary actions and active states in Signboard Green-Blue with white text.
- **Do** reserve Signal Amber for hail, boarding, and attention — nothing decorative.
- **Do** keep the ground pure white and glare-calm; let the plates carry the identity.
- **Do** align numbers in columns with tabular figures.
- **Do** snap plates into place with a single quick, decisive transition; honor `prefers-reduced-motion`.

### Don't:

- **Don't** use drop shadows, glass, or gradient text — the enamel world is flat.
- **Don't** round corners beyond 4px on any plate, button, or card.
- **Don't** decorate with airbrushed-jeepney novelty, neon "transport" color, or clip-art bus iconography — the rut this world refuses.
- **Don't** bury the map under forms on either surface.
- **Don't** show two destinations or quantities in one plate.
- **Don't** convey state by color alone; pair color with text or icon (WCAG AA).
