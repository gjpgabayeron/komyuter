---
type: reference
title: "Mobile commuter app: current state and absent scope"
description: What apps/mobile actually is today - a React Native Reusables Uniwind starter with one demo route, a root-stack-only navigator and three UI primitives - and which commuter features (state, services, map, AR, GPS-trace cache, trust scoring) are absent and tracked elsewhere.
tags: [mobile, expo, react-native, uniwind, tailwind, starter-template, navigation-scope, unimplemented-scope]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-07T11:05:10.019Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-466eb0d7a73ecb9fa3c99255
    resource: repo://.npmrc
  - id: openwiki-source-f576f991fe3e4167b6c29124
    resource: repo://apps/mobile/.npmrc
  - id: openwiki-source-3de323c9f3752d72d82de839
    resource: repo://apps/mobile/app.json
  - id: openwiki-source-3499d03c25905d042c8b4ce8
    resource: repo://apps/mobile/app/_layout.tsx
  - id: openwiki-source-d47024b7c953bf01c573c584
    resource: repo://apps/mobile/app/%2Bhtml.tsx
  - id: openwiki-source-62150dc0849fd6bc16f74ee7
    resource: repo://apps/mobile/app/%2Bnot-found.tsx
  - id: openwiki-source-1a4fd9e8bee72509b1281fc4
    resource: repo://apps/mobile/app/index.tsx
  - id: openwiki-source-8fbc4ba8846e5af5b3bd33f3
    resource: repo://apps/mobile/components.json
  - id: openwiki-source-38f4788ca122ed60297e3959
    resource: repo://apps/mobile/components/ui/button.tsx
  - id: openwiki-source-5813de75084df68ce5a2dddf
    resource: repo://apps/mobile/components/ui/icon.tsx
  - id: openwiki-source-cad8acd942a94496f9a92fa2
    resource: repo://apps/mobile/components/ui/text.tsx
  - id: openwiki-source-ee0ccda95097472c0e92b6f1
    resource: repo://apps/mobile/global.css
  - id: openwiki-source-1fa1b36e55340f7ec877953f
    resource: repo://apps/mobile/lib/theme.ts
  - id: openwiki-source-19cbf99c4f9afa788f09243e
    resource: repo://apps/mobile/lib/utils.ts
  - id: openwiki-source-5dbf878a79b69c0490b55733
    resource: repo://apps/mobile/metro.config.js
  - id: openwiki-source-e86fe7b76c693666bc2cb828
    resource: repo://apps/mobile/package.json
  - id: openwiki-source-e77facd0d228e527efb13e47
    resource: repo://apps/mobile/README.md
  - id: openwiki-source-df69c4fae1b108a15bfaf1ef
    resource: repo://apps/mobile/uniwind-types.d.ts
  - id: openwiki-source-68f9576586730b51891c3ce8
    resource: repo://docs/adr/0006-supabase-auth.md
  - id: openwiki-source-605402db4d6aeedf914f16c7
    resource: repo://docs/DEVIATIONS.md
  - id: openwiki-source-3ec59b00d289a615f79b6f15
    resource: repo://docs/SECURITY.md
  - id: openwiki-source-2fda883e9b76745f69f487f7
    resource: repo://eslint.config.mjs
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-440ae1e215cb02721dda855c
    resource: repo://turbo.json
generated: { by: "openwiki/0.7.1", at: "2026-10-07T11:05:10.019Z" }
---

# Mobile commuter app: current state and absent scope

`apps/mobile` is the pnpm workspace member whose package is named `mobile` — an Expo + React Native app that is still the **React Native Reusables "Minimal (Uniwind)" starter** it was generated from. The [README](../../apps/mobile/README.md) records the init command (`npx @react-native-reusables/cli@latest init`, then the Minimal (Uniwind) template), and the Expo identity is untouched: [app.json](../../apps/mobile/app.json) still declares `name`, `slug` and `scheme` as `minimal`, version `1.0.0`. No file in the package names a journey, stop, fare or boarding point — the only copy left in place is the demo line "Edit `app/index.tsx` to get started".

The responsibilities a commuter app would own — state, navigation beyond a single screen, and services — exist here as *scope*, not as code. This page states only what is present and points at where the intended design is authoritative: `docs/DEVIATIONS.md` **D10** for the tracked-but-unbuilt list, [ADR-0006](../../docs/adr/0006-supabase-auth.md) for commuter identity, and [Routing, navigation and trust are not implemented](../concepts/routing-and-navigation-scope.md) as the guard rail against inventing behaviour.

## Boot: one root layout, one stack

[`app/_layout.tsx`](../../apps/mobile/app/_layout.tsx) is the only layout the Expo Router registers; there are no route groups, no `(tabs)` and no nested stacks, so all navigation in the app is the root `Stack`.

```mermaid
flowchart TD
  entry["expo-router/entry as package main"] --> rootLayout["app/_layout.tsx RootLayout"]
  css["import @/global.css as side effect"] --> rootLayout
  uniTheme["useUniwind theme"] --> themeProvider["ThemeProvider value NAV_THEME of theme or light"]
  rootLayout --> themeProvider
  themeProvider --> statusBar["StatusBar style light when theme is dark"]
  themeProvider --> stack["Stack from expo-router"]
  themeProvider --> portalHost["PortalHost from rn-primitives portal"]
  stack --> indexRoute["index route app/index.tsx"]
  stack --> notFoundRoute["unmatched route app/+not-found.tsx"]
  htmlDoc["app/+html.tsx web-only root document"] -.->|web static render| stack
```

The root layout's composition order, and the only routes reachable beneath it.

Three details are load-bearing. `global.css` is imported for its side effect at the top of the layout, so the stylesheet reaches every route through the root. Within the layout the theme is read from `useUniwind()` and used twice — to pick `NAV_THEME[theme ?? "light"]` for the React Navigation theme, and to set the status-bar style — so an undefined theme falls back to light in every branch (the demo screen makes the same `?? "light"` fallback when choosing its logo and header icon). `PortalHost` is a **sibling** of the stack rather than a child, which is what lets RN Reusables overlay primitives render outside the navigator. The layout also re-exports Expo Router's `ErrorBoundary`, so a render error in any route surfaces through the framework's error screen instead of a blank frame.

## Screens

| Route | File | What it renders |
| --- | --- | --- |
| `/` (root) | [`app/index.tsx`](../../apps/mobile/app/index.tsx) | The template demo screen: an RN Reusables logo, two instructional lines, and two `Button`s wrapped in `Link asChild` that open `reactnativereusables.com` and the GitHub repo |
| any unmatched path | [`app/+not-found.tsx`](../../apps/mobile/app/+not-found.tsx) | One `Text` and a `Link` back to `/` |
| web document | [`app/+html.tsx`](../../apps/mobile/app/+html.tsx) | Web-only static-render shell: `<html lang="en" className="bg-background">`, viewport meta and `ScrollViewStyleReset` |

`app/index.tsx` sets its own screen options through `Stack.Screen` — title `React Native Reusables`, `headerTransparent: true`, and `headerRight` replaced by the theme toggle — so the header is owned per screen, not by the layout. The toggle calls `Uniwind.setTheme` imperatively from `onPressIn` and is the only mutation of app-wide state in the package; the app persists nothing itself (no storage dependency is present), so how that choice survives a restart is entirely the library's business and is not configured here. `app/+not-found.tsx` is the only internal `Link` in the app.

## Theming and styling pipeline

Theme data exists in two places, in two colour spaces, for two consumers:

- [`global.css`](../../apps/mobile/global.css) is the Uniwind/Tailwind entry: `@import "tailwindcss"`, `@import "uniwind"`, `@import "tw-animate-css"`, a small `@theme` block (radius scale plus `--spacing-hairline: hairlineWidth()`), and a `@layer theme` block whose `:root` defines **oklch** `--color-*` tokens under `@variant light` and `@variant dark`. These tokens are what make `className="bg-background text-muted-foreground"` resolve, and the set is complete (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, chart 1–5, sidebar family).
- [`lib/theme.ts`](../../apps/mobile/lib/theme.ts) holds a second, **hsl**-string palette (`THEME.light` / `THEME.dark`) and maps just six of its entries — `background`, `border`, `card`, `notification`, `primary`, `text` — onto React Navigation's `Theme` as `NAV_THEME`. That is the only slice of the palette the navigator chrome knows about; the chart and sidebar tokens are defined but unused by any component.

The styling pipeline is wired in [metro.config.js](../../apps/mobile/metro.config.js): the default Expo Metro config is passed through `withUniwindConfig` with `cssEntryFile: "./global.css"` and `dtsFile: "./uniwind-types.d.ts"`, which is both how `className` survives the bundle and why [`uniwind-types.d.ts`](../../apps/mobile/uniwind-types.d.ts) exists as a generated file that must not be hand-edited (it declares the `light`/`dark` theme tuple). TypeScript is strict through `expo/tsconfig.base` with the `@/*` → `./*` path alias ([tsconfig.json](../../apps/mobile/tsconfig.json)), and `expo-env.d.ts` / `env.d.ts` pull in `expo/types`, which is what makes the `typedRoutes` experiment in `app.json` check `Link href` values against generated route types.

## UI primitives and the extension point

<!-- openwiki: broken internal link [../../apps/mobile/components/ui] file "../../apps/mobile/components/ui" does not exist. Fix the href or restore the target, then delete this comment. -->
[`components/ui/`](../../apps/mobile/components/ui) contains exactly three RN Reusables components, all sharing `cn` ([`lib/utils.ts`](../../apps/mobile/lib/utils.ts), `clsx` + `tailwind-merge`):

- [`button.tsx`](../../apps/mobile/components/ui/button.tsx) — a `Pressable` with `cva` `variant`/`size` maps and `role="button"`. It wraps its children in `TextClassContext.Provider` with `buttonTextVariants({ variant, size })`, so a plain `Text` inside a button picks up variant-appropriate colour without being told; a disabled button is dimmed with `opacity-50`.
- [`text.tsx`](../../apps/mobile/components/ui/text.tsx) — `RNText` (or `Slot` when `asChild`) with variants `default`/`h1`–`h4`/`p`/`blockquote`/`code`/`lead`/`large`/`small`/`muted`, merging the context class with its own. Headings also set `role="heading"` and `aria-level`, and the same context is what the button and icon components consume.
- [`icon.tsx`](../../apps/mobile/components/ui/icon.tsx) — a Lucide wrapper where `withUniwind(IconImpl, …)` maps `className` to the `width` and `color` style props, so `className="size-5 text-foreground"` styles an SVG icon. It defaults to `size-5 text-foreground` and appends the ambient `TextClassContext`.

Adding a component is a CLI operation, not a hand-written one: [`components.json`](../../apps/mobile/components.json) is the registry config (`style: "new-york"`, `baseColor: "neutral"`, `css: "global.css"`, aliases for `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`) and the README documents `npx react-native-reusables/cli@latest add …`. One consequence worth knowing: the `@/hooks` alias resolves into a directory that does not exist yet, so the first hook component added creates it.

## What is absent (tracked planned work, not defects)

Nothing below is a bug or an oversight; each item has an authoritative design elsewhere.

- **No state layer.** No `zustand`, no React Query, no Redux and no custom store — a grep for `zustand` in the package returns nothing. The only cross-render state is Uniwind's theme.
- **No service layer.** No file in the package calls `fetch`, there is no API client, no base-URL or environment read, and no Supabase client (`supabase` appears nowhere in the package). The app never talks to `apps/server`.
- **No device or map capability.** `@rnmapbox/maps`, `expo-camera`, `expo-sensors` and `expo-sqlite` are not dependencies, and `app.json` declares no location, camera or sensor permissions — its plugin list is only `expo-router`, `expo-splash-screen` and `expo-status-bar`.
- **Declared-but-unimported dependencies.** Several template dependencies are declared in [`package.json`](../../apps/mobile/package.json) yet imported by no file under `apps/mobile` (`react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics`, `expo-updates`, `expo-linking`, `expo-constants`, `expo-system-ui`, `react-native-keyboard-controller`, `react-native-svg`). `react-native-reanimated` being present and unused is recorded at [`docs/DEVIATIONS.md` D10](../../docs/DEVIATIONS.md).

`docs/DEVIATIONS.md` §2 marks the mobile increments — AR wayfinding, `@rnmapbox/maps`, an `expo-sqlite` offline trace cache and MHD trust scoring — as **Planned / not implemented**, and notes that no server trust/GPS-trace endpoint exists either. [ADR-0006](../../docs/adr/0006-supabase-auth.md) settles the identity model this app will use (anonymous by default, optional sign-in) but no auth code exists here ([`docs/SECURITY.md`](../../docs/SECURITY.md) records that as its M1 gap); the AR design constraints live in `AGENTS.md`, and the visual/strategic surface brief in [`apps/mobile/.impeccable/surfaces/apps-mobile.md`](../../apps/mobile/.impeccable/surfaces/apps-mobile.md) — both cited as authority, not restated here.

## Gates, scripts and install layout

The app is first-class in the repository's quality gates even though it builds little:

- The root `pnpm typecheck` script includes `pnpm --filter mobile typecheck` (`tsc --noEmit`), and the single root ESLint flat config scopes `eslint-config-expo/flat.js` to `apps/mobile/**/*.{ts,tsx,js,jsx,mjs,cjs}`. Both currently report no errors for this package (the package also declares its own `lint` and `typecheck` scripts, but the gate that runs is the root pair).
- CI runs `format:check`, `lint`, `typecheck`, the admin test suite, then `build` — so mobile is covered by the first three. The package declares **no `test` and no `build` script**, which is why `turbo run test` and `turbo run build` skip it; lint plus typecheck are the whole of its automated verification, and there are no mobile tests to run.
- Development is Expo-driven: `pnpm dev` → `expo start -c`, with `android`, `ios` and `web` variants, and the README notes the project runs in Expo Go. `app.json` bundles web with Metro to `static` output and enables the `typedRoutes` experiment, so adding a route regenerates `.expo/types` for type-checking.
- [`apps/mobile/.npmrc`](../../apps/mobile/.npmrc) sets `node-linker=hoisted` (plus `enable-pre-post-scripts=true`), unlike the root `.npmrc`, which sets only `auto-install-peers`; installs for this package are therefore flat-linked while the rest of the workspace is not.
- The app reads no configuration or secrets of its own: no `.env.example`, no `expo.extra` keys. Nothing on [Configuration, environment variables and secrets](../operations/configuration-and-secrets.md) applies to `apps/mobile` today.

## Where to look next

- [Routing, navigation and trust are not implemented](../concepts/routing-and-navigation-scope.md) — read this before writing any commuter-app feature.
- [System overview](../architecture/system-overview.md) — how the mobile app sits (unwired) next to the admin SPA, Fastify API and Supabase stack.
- [Admin SPA shell](./admin-shell-and-routing.md) — the shape a real client in this repo has today, for contrast.
- [`docs/DEVIATIONS.md`](../../docs/DEVIATIONS.md) §2 (D10) and [ADR-0006](../../docs/adr/0006-supabase-auth.md) — the tracked work and the identity decision.
