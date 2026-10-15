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

# The Supabase CLI, which only the pre-deploy migration step uses — the serving
# process never calls it. Carrying it is a deliberately recorded cost
# (ADR-0022 §3.2), the second exception to this project's "add no runtime
# dependencies" line after @fastify/static (ADR-0018).
#
# Pinned, and pinned to the same version the operator's own CLI is, so the
# local rehearsal in docs/DEPLOY.md exercises the exact binary the platform
# will run.
#
# Installed from npm rather than from a GitHub release tarball on purpose: the
# package's per-platform binaries are optionalDependencies, so npm selects the
# right one for the build's architecture instead of hard-coding it, and the
# base image already carries npm — where a tarball would need curl and an apt
# layer that this slim image does not have.
ARG SUPABASE_CLI_VERSION=2.111.0
RUN npm install --global --no-fund --no-audit "supabase@${SUPABASE_CLI_VERSION}" \
  && npm cache clean --force

COPY --from=build /deploy/server ./server
# The SPA that this same process serves — one origin, one image for staging and
# production (ADR-0018 §2).
COPY --from=build /app/apps/admin/dist ./apps/admin/dist

# The migration chain, for `supabase db push` in Railway's pre-deploy step
# (ADR-0022 §3): a distinct lifecycle phase, not container boot, so a failure
# fails the deployment instead of shipping a new container against an old
# schema (ADR-0018 §5).
#
# The migrations directory is copied by name and nothing else from supabase/:
# seed.sql in particular must never enter this image, because it seeds the
# documented dev credential and no deployed environment may contain it
# (ADR-0022 §3.4).
COPY supabase/migrations ./supabase/migrations

# ADR-0018 §1: the API serves the SPA from its own origin, so the container has
# to say where the build landed. Unset, the server still starts and still
# answers /api/*, but every page 404s — the walk-up fallback finds no workspace
# in a runtime image.
ENV ADMIN_DIST_DIR=/app/apps/admin/dist
ENV PORT=3000
EXPOSE 3000

USER node
CMD ["node", "server/dist/server.js"]
