# ADR-0023: Documentation scope — why and rules, not how (DECIDED)

- **Status**: DECIDED — applied in the same change that records it (2026-10-16)
- **Date**: 2026-10-16
- **Supersedes/refines**: supersedes `openwiki/INSTRUCTIONS.md` (retired with the wiki it configured) and
  the SpecKit constitution that this repository retired on 2026-10-16 in favour of the engineering skills
  recorded in `docs/agents/`. Refines **`docs/PRINCIPLES.md` Principle V** by making "measurable" apply to
  documentation claims too, and **Principle II** by requiring this policy to be an ADR rather than an
  unwritten habit. Leaves the document-authority ladder in `AGENTS.md` intact — this ADR sits under it.

## Context

The repository carried two generated or semi-generated documentation surfaces, both of which restated the
code rather than the reasoning behind it.

**`openwiki/`** was a 60-file, 2.2 MB generated wiki whose stated purpose was "the current-state reference
for **how this repository works today**". It was produced by the `openwiki` CLI, refreshed through an MCP
server configured in `opencode.jsonc`, and it carried a `.claims/*.json` sidecar per page asserting
independently falsifiable system truths against source spans. The generated pages duplicated facts the
code already states — call graphs, data flow, symbol inventories — and had to be regenerated whenever
source drifted, which is a maintenance cost paid on every change to keep prose in step with code that the
reader can simply read.

**`docs/ADMIN.md`** (662 lines) had drifted the same way by accretion. Its §10 was a file map of
`apps/admin` and `apps/server`, and Appendices A, B, C and G were verbatim reproductions of
`packages/shared/src/types/*` and `apps/server/src/api/*`. None of it could be trusted without checking
against the source it copied, and none of it recorded a decision.

Three facts made removal the right disposition rather than repair.

**A document that restates code is a second source of truth that drifts silently.** The repository's own
governing rule — the ADR wins, and the code is the record of what is built — means a prose copy of a type
definition is authoritative for nothing and wrong the moment someone edits the type. The generated wiki
acknowledged this by requiring every page to cite the source span it paraphrased, which is an expensive way
to describe reading the file.

**The rules are already stated, once, in `AGENTS.md`.** `openwiki/INSTRUCTIONS.md` — the one hand-authored
file the generator never rewrote — carried a curated invariant list (coordinate order, `::geography`, the
two distinct fare notions, no-ETA, two-direction routes, per-edge-type normalization, MHD as informational
only, hail-and-ride virtual nodes, drizzle string mode). Comparing it against `AGENTS.md` line by line,
all but two of those invariants were already present there, in the same substance if not the same words.
The wiki was therefore not the home of the rules; it was a copy of a copy.

**Two generations of agent tooling had already been retired for the same reason.** SpecKit was removed on
2026-10-16 (its `.specify/` tree and command set), and its durable content was salvaged into
`docs/PRINCIPLES.md` and the engineering skills configured under `docs/agents/`. The lesson recorded then —
keep the durable decisions, drop the mechanism — applies unchanged to OpenWiki.

## Decision

1. **Documentation carries intent, not implementation.** A document may state what the system is for, why
   it is shaped this way, what was decided and rejected, what the invariants are, how to set it up and
   operate it, and what is planned. It MUST NOT restate what a reader can read from the source, the
   schemas, or the tests, and it MUST NOT be maintained as a second copy of them.

2. **The authority ladder is unchanged and is the test for a new document.** In decreasing order:
   `docs/adr/` (decisions and rationale, authoritative) → `AGENTS.md` (conventions, commands, rules) →
   the code and its tests → prose documents. A new prose document is justified only when it carries
   something the ladder above it does not.

3. **`openwiki/` is retired in full.** The wiki, its `.claims/` sidecars, the `openwiki` MCP server entry
   in `opencode.jsonc`, the installed skill under `.opencode/`, the inert
   `.github/workflows/openwiki-update.yml`, the ignore rules in `.gitignore`, `.prettierignore` and
   `.dockerignore`, and `.openwikiignore` are all removed. The global `openwiki` CLI is left installed on
   the development machine; nothing in the repository invokes it.

4. **"How does the system work today?" is answered by the code and its tests.** No replacement artifact is
   created. `AGENTS.md` carries the rules and `docs/adr/` the decisions; the runtime behaviour is read from
   the source, which cannot drift from itself.

5. **`docs/ADMIN.md` keeps its intent and loses its copies.** §10's file map and Appendices A (Domain
   types), B (Geometry types), C (Zod schemas) and G (API surface) are deleted; §12's task plan is deleted
   because it restated `docs/ROADMAP.md`'s sequence. The TL;DR, data model, functional requirements,
   success criteria, known limitations, reference index, the fare rule, the design tokens, the ADR index
   and the glossary are kept.

6. **Records and citations are not "how".** `docs/adr/*`, `docs/archive/*`, `docs/thesis/*`, `specs/*`,
   `docs/BACKEND.md` and `docs/SECURITY.md` are untouched by this policy. They are either decisions, dated
   records of a process, or conceptual material that is cited **by line number** from other documents —
   pruning them would break citations rather than reduce duplication.

7. **Stale generated boilerplate is removed with the generated material.** `apps/admin/README.md` and
   `apps/mobile/README.md` were framework starter files describing React Compiler, Oxlint and the Uniwind
   template — none of it true of this repository. `apps/server/README.md` and `navbench/README.md` describe
   real setup and are kept.

## Consequences

- **The documentation set is now a rulebook, not a description.** Reading `AGENTS.md` plus `docs/adr/`
  tells a newcomer or an agent the rules and the reasoning; the behaviour is read from the code. Nothing
  in the set has to be updated because a function changed shape.

- **The wiki could not be rebuilt without re-initialising.** `openwiki/` no longer exists in the working
  tree or in reach of an agent, and `.github/workflows/openwiki-update.yml` — the placeholder that blocked
  the tool's daily scaffold — is gone with it. Re-adopting the tool would start from `openwiki --init` and
  would produce a fresh wiki, not recover these pages. The content is recoverable from Git history up to
  this change.

- **`openwiki_search`, `openwiki_read`, `openwiki_list_workspaces` and `openwiki_list_wikis` are gone.**
  Any skill, prompt or habit that reached for them must fall back to reading source and `docs/`. The
  `AGENTS.md` block that described them is removed rather than left dangling.

- **Two passing mentions of `openwiki` remain in records.** `docs/adr/0022` and `docs/archive/SUMMARY.md`
  both name it. They are a decision record and a superseded historical document respectively, and both are
  left as written — the same treatment `docs/DEVIATIONS.md` gives the removed `.specify/` tree.

- **The pruning is a large deletion and was done deliberately.** Roughly 250 lines left `docs/ADMIN.md`,
  two READMEs were deleted, and 60 tracked files left the repository. The deleted appendix content is
  recoverable from Git history; nothing in it was a decision.

- **New prose documentation is now the exception.** This policy makes "write a doc" the answer only when
  the content is intent. A change that would previously have been accompanied by a page of explanation is
  accompanied instead by the code and, where a choice was made, an ADR.

## Alternatives considered

- **Keep OpenWiki and prune its scope.** Rejected: its purpose was to describe how the code works, so a
  pruned wiki is a smaller copy of the code, not a different kind of document. The maintenance cost is per
  change to source, not per page retained.

- **Regenerate the wiki on demand only.** Rejected: the repository already kept it out of CI (the workflow
  was inert by design), so this was the current state, and the wiki still drifted because regeneration is
  manual and drift is not visible until someone runs it.

- **Salvage `openwiki/INSTRUCTIONS.md` into a new `docs/ARCHITECTURE.md`.** Rejected: the file's only
  durable content not already in `AGENTS.md` was a preference for Mermaid diagrams and an explicit
  out-of-scope list, both of which belong in `AGENTS.md`'s documentation rule rather than a new file. A new
  file would immediately become one more surface to keep in step.

- **Consolidate every document into a single root `project-context.md`.** Rejected: it would break the
  ADR-wins rule by collapsing 22 separate decisions into one file, split `docs/thesis/` out of the tree it
  is a deliverable of, and invalidate the line-number citations in `docs/DEVIATIONS.md` and `docs/adr/`.
  A single entry point (`AGENTS.md`) achieves the navigability the consolidation was aimed at, without
  destroying granularity that other documents depend on.

- **Delete `docs/BACKEND.md` and `docs/SECURITY.md` as "how" documents.** Rejected: `docs/DEVIATIONS.md`
  cites `BACKEND.md` by line number, `docs/adr/0019` cites `SECURITY.md` §6.2 as the substance it inherits,
  and `docs/adr/0022` cites its finding E3. They are cited records, and a line-number citation is broken by
  any edit above it.
