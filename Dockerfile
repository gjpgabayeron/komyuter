# ADR-0018 §3 — an explicit multi-stage Dockerfile rather than Railway's build
# auto-detection: this is a pnpm + turbo workspace, which is exactly the case
# framework-detecting builders get wrong. The image runs ONE service that both
# answers the API and serves the admin SPA (ADR-0018 §1).

# ---------------------------------------------------------------------------
# Build
#   apps/server/dist/server.js — the API, bundled so plain `node` can run it.
#     Both halves of the server are unusable by node as emitted by `tsc`:
#     `moduleResolution: Bundler` emits extensionless relative specifiers, and
#     `@komyuter/shared`'s entry is raw TypeScript. Bundling resolves both, and
#     is why `pnpm build` is followed by `node` as the ADR intends.
#   apps/admin/dist            — the SPA, built in PRODUCTION mode, so
#     `.env.production` pins an empty VITE_API_URL and the artifact is
#     same-origin with no hostname baked in (ADR-0018 §2).
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# There is no .git in the build context, so husky's `prepare` hook must not run.
ENV HUSKY=0
RUN corepack enable
WORKDIR /app

# Manifests first: the dependency layer then survives edits to source.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

COPY . .
# Only the two packages the service is made of. The mobile app and its React
# Native toolchain are never built into this image.
RUN pnpm exec turbo run build --filter=server --filter=admin

# The server's production dependency closure on its own, so the runtime stage
# does not carry the workspace's devDependencies. Verified to resolve the
# workspace link (@komyuter/shared ships as source, and is inlined in the
# bundle above — so it is a build-time input, not a runtime requirement).
RUN pnpm --filter server deploy --prod /deploy/server

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /deploy/server ./server
# The SPA that this same process serves — one origin, one image for staging and
# production (ADR-0018 §2).
COPY --from=build /app/apps/admin/dist ./apps/admin/dist

# ADR-0018 §1: the API serves the SPA from its own origin, so the container has
# to say where the build landed. Unset, the server still starts and still
# answers /api/*, but every page 404s — the walk-up fallback finds no workspace
# in a runtime image.
ENV ADMIN_DIST_DIR=/app/apps/admin/dist
ENV PORT=3000
EXPOSE 3000

USER node
CMD ["node", "server/dist/server.js"]
