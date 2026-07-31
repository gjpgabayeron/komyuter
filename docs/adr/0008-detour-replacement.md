# ADR-0008: Triggered detour replaces (not parallels) the base segment

When a detour activates for a request, the direction's path between the detour's entry and exit nodes is **replaced** by the detour loop — the base-polyline segment between those nodes is not usable in that same request.

Rationale: a jeepney taking the Super loop does not also traverse Ledesma straight. Leaving both available lets Dijkstra invent a "free shortcut" through a street the vehicle is not on. Fare and distance are computed over the cumulative detour path (SCHEMA §4.4). Trigger mechanism: landmark selection as primary, destination-proximity as secondary validator (per SCHEMA §4.3).
