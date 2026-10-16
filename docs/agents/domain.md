# Domain docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

**This repo is single-context.** There is no `GLOSSARY-MAP.md` and no per-context glossaries: the whole system — commuter app, admin dashboard, server, `@komyuter/shared` — shares one domain model and one vocabulary.

## Before exploring, read these

- **`docs/CONTEXT.md`** — this repo's glossary and ubiquitous language. It is the `GLOSSARY.md` for this repo; the file is simply named and located differently.
- **`docs/adr/`** — the authoritative decision record (`0001`–`0022`). Read the ADRs that touch the area you're about to work in. **Where any document disagrees with an ADR, the ADR wins.**
- **`docs/PRINCIPLES.md`** — the project principles that shape engineering choices here.
- **`docs/ROADMAP.md`** — milestone authority: the order of work (`M1`–`M6`) and the exit criterion that closes each milestone. Reference milestone ids; don't restate them.

`AGENTS.md` at the repo root carries the runtime conventions (commands, quality gates, code conventions) and points at the rest.

If a document above is missing, **proceed silently**. Don't flag its absence and don't suggest creating it upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates glossary entries and ADRs lazily, when a term or decision actually gets resolved.

## File structure

```
/
├── AGENTS.md                     ← runtime conventions for agents
├── docs/
│   ├── CONTEXT.md                ← the glossary (this repo's GLOSSARY.md)
│   ├── PRINCIPLES.md             ← project principles
│   ├── ROADMAP.md                ← milestone authority
│   ├── adr/                      ← 0001–0022, the decision record
│   └── agents/                   ← this directory: skill configuration
├── specs/                        ← completed per-feature specs (history)
└── apps/ + packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `docs/CONTEXT.md`. Don't drift to the synonyms it explicitly avoids — "Line" for Route, "Hail-and-ride point" for Boarding Point, "user" for Commuter or Account.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider), or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding. Several ADRs here are deliberate and easy to "fix" by accident — do not re-litigate them without saying so:

> _Contradicts ADR-0001 (internal Dijkstra cost is base-on-board + marginal ₱1.80/km, not per-edge LTFRB fare), but worth reopening because…_

Two that catch people most often:

- **ADR-0001** — the Dijkstra **internal** cost is deliberately not the LTFRB formula; the LTFRB formula is only what gets **displayed**.
- **ADR-0013** — `[longitude, latitude]` everywhere, with no conversion layer. A swapped pair puts stops in the ocean.
