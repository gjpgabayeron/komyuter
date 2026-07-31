# Project Scaffold Strategy

A tool-agnostic guide for bootstrapping a production-ready project foundation.

## Core Principles

A good scaffold answers five questions before any feature code is written:

| Question                      | Answer                                |
| ----------------------------- | ------------------------------------- |
| What are we building and why? | Spec-driven development               |
| Is the code correct?          | Linting + type checking + testing     |
| Are commits meaningful?       | Conventional commits + commit linting |
| Does CI enforce quality?      | Automated gates on every push         |
| Can AI help without chaos?    | Agent governance with human review    |

Each layer is independent. You can adopt them one at a time.

---

## 1. Spec-Driven Development

**Purpose:** Define _what_ and _why_ before _how_. Prevents vibe-coding drift.

[Spec Kit](https://github.com/github/spec-kit) is the reference implementation. It provides a CLI (`specify`) that bootstraps spec-driven workflows for any project — monorepo or single-package, any language, any framework.

**Workflow:**

```
constitution → specify → plan → tasks → implement
```

Each step produces a markdown artifact in `specs/{###}-name/`:

| Artifact      | Content                               | Gate                  |
| ------------- | ------------------------------------- | --------------------- |
| `spec.md`     | User stories, functional requirements | Review by stakeholder |
| `plan.md`     | Tech stack, architecture, data model  | Review by lead        |
| `research.md` | Technology validation, trade-offs     | Review by team        |
| `tasks.md`    | Actionable task breakdown             | Ready to implement    |

**Setup (one-time, any project):**

```bash
# Requires: Python 3.11+, uv
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.10.2

# Bootstrap the project (works with any tech stack)
specify init . --force --integration <agent>

# Available integrations: opencode, claude, copilot, gemini, codex, cursor, qwen, vibe, generic
```

This creates:

- `.specify/` — templates, scripts, agent instructions
- `.specify/memory/constitution.md` — project principles
- Agent commands for your chosen AI tool

**Agent-agnostic:** The artifacts (`specs/*.md`) are plain markdown. Any AI agent or human can read and edit them. The AI tool integration just provides convenience slash commands.

---

## 2. Linting and Code Quality

**Purpose:** Catch errors before they reach CI. Enforce a consistent style mechanically.

### Layer 1: Editor Config (`.editorconfig`)

Zero-dependency. Every editor reads it automatically. Prevents whitespace drift before any tool runs.

```ini
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
[*.md]
trim_trailing_whitespace = false
```

### Layer 2: Formatter

Use one formatter for all languages. Prettier is the default choice because it's zero-config for most projects and has plugins for every major language.

**Config highlights:**

- `semi: false` — fewer tokens, cleaner diffs
- `singleQuote: false` — doubles are standard in JSON/HTML
- `trailingComma: "es5"` — cleaner diffs when adding items
- `endOfLine: "lf"` — consistent across Windows/macOS/Linux

### Layer 3: Linter

ESLint with flat config is the standard. Structure:

```
eslint.config.js            # Root config — handles shared ignores
apps/web/eslint.config.js   # Per-package config (if monorepo)
packages/ui/eslint.config.js
```

**Per-package configs** solve the monorepo `tsconfigRootDir` problem — each config sets its own `parserOptions.tsconfigRootDir` to avoid the "multiple candidate TSConfigRootDirs" error. Non-monorepo projects can use a single config.

**Key decisions:**

| Decision                                     | Rationale                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tsconfigRootDir: import.meta.dirname`       | Tells the parser which `tsconfig.json` to use without enabling full type-aware linting (which is expensive)  |
| `passWithNoTests: true`                      | CI doesn't fail when no tests exist yet                                                                      |
| `react-refresh/only-export-components: warn` | Pre-existing shadcn/ui components export constants alongside components — warning is fine, error would block |

**Type-aware linting** (`project: true`) should be enabled in CI only, not in pre-commit hooks. It causes process termination (SIGKILL) on larger file sets because creating a TypeScript program per file is memory-intensive.

### Layer 4: Pre-commit Hooks (Husky + lint-staged)

```sh
# .husky/pre-commit
BRANCH_NAME=$(git symbolic-ref --short HEAD 2>/dev/null)
case "$BRANCH_NAME" in
  main|master|develop) ;;
  feat/*|fix/*|chore/*|docs/*|refactor/*|test/*|style/*|ci/*|perf/*|build/*|revert/*) ;;
  *)
    echo "⚠️  Branch name '$BRANCH_NAME' doesn't match convention"
    echo "   Expected: {type}/description"
    ;;
esac

# Run lint-staged (defined in package.json)
pnpm lint-staged
```

**lint-staged config** (in `package.json`):

```json
"lint-staged": {
  "*.{ts,tsx}": "pnpm exec eslint",
  "*.{ts,tsx,json,md}": "pnpm exec prettier --check"
}
```

Using `--check` mode (not `--write`) forces developers to manually fix issues. Auto-formatting is delegated to the editor via `formatOnSave`. This prevents hidden changes from creeping into commits.

> **Pitfall: ESLint not found at root (pnpm monorepo)**
>
> In a pnpm monorepo where ESLint is installed in sub-packages (`apps/*`, `packages/*`) but not at the workspace root, `pnpm exec eslint` from `lint-staged` (which runs from root) will fail with `'eslint' is not recognized`.
>
> **Fix:** Install `eslint` (and its peer plugins: `@eslint/js`, `typescript-eslint`, `globals`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`) as root `devDependencies` via `pnpm add -D -w eslint ...`. This makes `eslint` resolvable from the root while the per-package `eslint.config.js` files still control per-file rules via flat config's nearest-config resolution.

---

## 3. Commit Linting

**Purpose:** Every commit message tells a story. Enables automated changelogs and semantic versioning.

### Conventional Commits

```
type(scope): description
```

| Type       | Usage                 |
| ---------- | --------------------- |
| `feat`     | New feature           |
| `fix`      | Bug fix               |
| `chore`    | Tooling, deps, config |
| `docs`     | Documentation         |
| `refactor` | Code restructuring    |
| `test`     | Tests                 |
| `style`    | Formatting            |
| `ci`       | CI/CD                 |
| `perf`     | Performance           |
| `build`    | Build system          |
| `revert`   | Revert                |

### Enforcement (commitlint)

```bash
# Install
pnpm add -D -w @commitlint/cli @commitlint/config-conventional

# Config: commitlint.config.js
export default { extends: ["@commitlint/config-conventional"] }

# Hook: .husky/commit-msg
pnpm commitlint --edit $1
```

**Why commitlint over only PR titles:** Commits are the source of truth. PRs get squashed, rebased, or lost. The git log is forever.

### Integration with Changesets

For monorepos with publishable packages, [Changesets](https://github.com/changesets/changesets) builds on conventional commits to automate version bumps and changelogs:

```bash
pnpm add -D -w @changesets/cli
pnpm changeset init
```

Workflow: developer runs `pnpm changeset` → selects bumped packages → writes summary → CI creates a version PR → merge publishes.

---

## 4. CI Workflows

**Purpose:** Every push goes through the same gates, regardless of who or what made the change.

### Core CI (required)

```yaml
name: CI
on: [push, pull_request] # branch filter optional
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: <install dependencies>
      - run: <lint>
      - run: <typecheck>
      - run: <test>
      - run: <build>
```

**Gate order matters:** Fail fast. Lint is cheapest → typecheck catches structural issues → tests validate logic → build is the final confirmation.

### Security (CodeQL)

GitHub's free static analysis. Detects injection flaws, insecure patterns, credential leaks:

```yaml
name: CodeQL
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
  schedule: [{ cron: "0 6 * * 1" }]
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: <languages>
          queries: security-and-quality
      - uses: github/codeql-action/analyze@v3
```

### Dependency Updates (Dependabot)

Weekly automated PRs for dependency bumps. Group related updates to reduce noise:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly", day: "monday" }
    groups:
      eslint:
        patterns: ["eslint*", "@eslint/*", "typescript-eslint"]
      testing:
        patterns: ["vitest*", "@vitest/*", "@testing-library/*"]
      react:
        patterns: ["react*", "@types/react*"]
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly", day: "monday" }
```

### Version Branches (Changesets)

```yaml
name: Changeset
on:
  push: { branches: [main] }
jobs:
  version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: <install dependencies>
      - id: changesets
        uses: changesets/action@v1
        with:
          version: <version command>
          commit: "chore: version packages"
          title: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 5. AI Agent Governance

**Purpose:** AI agents accelerate development without bypassing human review.

### Principle: Agents Stage, Humans Commit

AI agents can read files, write code, run commands, and stage changes — but they must never commit or push. This enforces a review gate before anything enters the codebase.

### AGENTS.md (Tracked in Repo)

A project-context file that any AI agent reads on startup. Contains:

- Project purpose and architecture
- Tech stack with versions
- Code style conventions
- Common commands
- Commit policy (no auto-committing)
- Link to `docs/ai-tooling.md` for tool-specific setup

This file is AI-agnostic. Any agent can consume it.

### Gitignore AI Configs

AI tool configs are personal. Each developer chooses their own agent and configures it locally:

```
.agents/
.opencode/
.claude/
opencode.json
```

### Recommendations in `docs/ai-tooling.md`

A tracked reference document that suggests tools and MCP servers without enforcing them:

- Which AI agents are known to work well with this project
- Recommended MCP servers (Playwright, GitHub, Filesystem)
- How to bootstrap spec-kit for each agent
- How to set up permission rules (example for opencode)

### Permission Rules (Optional, Per-Developer)

Example `opencode.json` (gitignored — each developer copies their own):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["AGENTS.md"],
  "permission": {
    "bash": {
      "*": "ask",
      "<package manager> *": "allow",
      "git add *": "allow",
      "git status*": "allow",
      "git diff*": "allow",
      "git log*": "allow",
      "git branch*": "allow",
      "git stash*": "allow",
      "git restore*": "allow",
      "git checkout*": "allow",
      "git reset*": "allow",
      "git commit*": "deny",
      "git push*": "deny",
      "git merge*": "deny",
      "git revert*": "deny"
    }
  }
}
```

This ensures the AI can develop, test, and stage — but must ask a human to commit.

---

## Tool-Specific Adaptation Notes

### Monorepo vs Single Package

| Concern        | Monorepo                                          | Single Package              |
| -------------- | ------------------------------------------------- | --------------------------- |
| ESLint config  | Per-package (each sets its own `tsconfigRootDir`) | Single root config          |
| Test discovery | Workspace file (`vitest.workspace.ts`)            | Single `vitest.config.ts`   |
| CI caching     | Cache per-package `node_modules`                  | Cache single `node_modules` |
| Versioning     | Changesets                                        | Semantic release or manual  |

### Framework-Specific Linting

| Framework        | Additional ESLint plugins                                  |
| ---------------- | ---------------------------------------------------------- |
| React/Next.js    | `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` |
| Vue/Nuxt         | `eslint-plugin-vue`                                        |
| Astro            | `prettier-plugin-astro`, `@astrojs/check`                  |
| Svelte/SvelteKit | `eslint-plugin-svelte`                                     |
| Node/Express     | No additional, use base `@eslint/js` + `typescript-eslint` |

### Windows Notes

- Package manager exec via `pnpm exec eslint` (not direct `eslint`) — PowerShell doesn't resolve `node_modules/.bin` automatically
- Use `case` in shell scripts instead of `grep` — git bash on Windows may not have `grep`
- Paths with spaces (common in Windows usernames) need quoting in `.cmd` files

---

## Implementation Order

If adopting incrementally, do them in this order:

1. **`.editorconfig` + `.gitignore`** — 5 minutes, immediate payoff
2. **Prettier** — format the entire codebase, then enforce via CI
3. **ESLint** — catch real bugs
4. **Husky + lint-staged** — enforce before commit
5. **Commitlint** — clean git history
6. **CI pipeline** — catch what pre-commit missed
7. **Testing framework** — start writing tests
8. **CodeQL + Dependabot** — security and maintenance automation
9. **Spec-kit** — spec-driven development workflow
10. **AI governance** — AGENTS.md + gitignored agent configs
