#!/usr/bin/env node
//
// The guarded pre-deploy migration runner.
//
// ADR-0018 §5 wants migrations applied as an explicit step *before* the new
// container goes live and never at container boot, so a rolling deploy cannot
// race a schema change; ADR-0022 §3 names Railway's `deploy.preDeployCommand` as
// that step natively. This file is what that step runs. The Dockerfile copies it
// into the image at /app/deploy/pre-deploy.mjs, where the platform's preferred
// argv form — `["/app/deploy/pre-deploy.mjs"]` — can execute it directly.
//
// Why a script at all: the platform runs the command array with **no shell**, so
// an element containing `$DATABASE_URL` reaches the CLI as that literal eight
// characters — measured, and recorded in docs/DEPLOY.md §3.4. Reading the
// connection string from the environment inside a process is the only form that
// does not depend on platform interpolation.
//
// Why a guard at all: the command is byte-identical in staging and production;
// the only thing distinguishing them is the environment's own configuration. A
// staging deployment whose DATABASE_URL was pasted from the production project
// would migrate production, and nothing downstream would notice. This is not a
// security boundary against a malicious operator — it is one against a plausible
// copy/paste — so it refuses rather than warns, and it refuses *before* the CLI
// is invoked, when nothing has been applied yet.
//
// Inputs, all required:
//   DATABASE_URL                    the target connection string (never printed)
//   RAILWAY_ENVIRONMENT_NAME        injected by the platform: staging | production
//   EXPECTED_ENVIRONMENT            set per environment (.railway/railway.ts)
//   EXPECTED_SUPABASE_PROJECT_REF   set per environment (.railway/railway.ts)
//
// Exit status: 0 when the chain is applied (or already up to date), 1 on any
// refusal or CLI failure. Railway treats a non-zero pre-deploy as a failed
// deployment, which is the point: the previous healthy deployment keeps serving.

import { spawnSync } from "node:child_process";

const REQUIRED_VARIABLES = [
  "DATABASE_URL",
  "RAILWAY_ENVIRONMENT_NAME",
  "EXPECTED_ENVIRONMENT",
  "EXPECTED_SUPABASE_PROJECT_REF",
];

// Loopback, plus the one name a container uses to reach its host — which is what
// the local rehearsal in docs/DEPLOY.md passes via
// `--add-host host.docker.internal:host-gateway`. Matched exactly, never by
// suffix: `localhost.example.com` is a remote host, and there is no bypass for a
// remote host.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

class Refusal extends Error {}

function refuse(message) {
  throw new Refusal(message);
}

function report(message) {
  process.stdout.write(`pre-deploy: ${message}\n`);
}

function isLocalHost(host) {
  return LOCAL_HOSTS.has(host) || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

function readConnection(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    // Without the value: the URL is a credential, so not even a malformed one
    // goes into a deployment log.
    refuse("DATABASE_URL is not a parseable URL");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    refuse(`DATABASE_URL is not a postgres:// or postgresql:// URL (scheme "${url.protocol}")`);
  }
  if (url.hostname === "") {
    refuse("DATABASE_URL carries no host");
  }

  return url;
}

// The project ref, from either of the two connection forms Supabase documents:
//
//   direct          db.<ref>.supabase.co            (IPv6-only, AAAA and no A)
//   session pooler  *.pooler.supabase.com,          (IPv4 — the form a container
//                   username postgres.<ref>          without IPv6 egress needs)
//
// Null means "no ref is expressible in this URL", which is not itself a failure:
// it is the local rehearsal case, and the caller decides. Anything the platform
// will reach must yield a ref.
function supabaseProjectRef(url) {
  const host = url.hostname.toLowerCase();

  const direct = /^db\.([a-z0-9]+)\.supabase\.(?:co|in)$/.exec(host);
  if (direct !== null) {
    return direct[1];
  }

  if (host === "pooler.supabase.com" || host.endsWith(".pooler.supabase.com")) {
    let username;
    try {
      username = decodeURIComponent(url.username);
    } catch {
      username = url.username;
    }
    const pooled = /^postgres\.([a-z0-9]+)$/.exec(username.toLowerCase());
    if (pooled !== null) {
      return pooled[1];
    }
  }

  return null;
}

// The CLI is known to print what it was given, and a failing CLI is exactly when
// output is most likely to be copied into a ticket. Every string that could
// reconstruct the credential is replaced rather than merely avoided by this
// script's own logging.
function redact(text, secrets) {
  let redacted = text;
  for (const secret of secrets) {
    if (secret !== "") {
      redacted = redacted.split(secret).join("[REDACTED]");
    }
  }
  return redacted;
}

// Test seam only: the unit tests point this at a stub, because there is no
// `supabase` binary in this repository and the suite must not need one. Unset in
// the image, where the pinned CLI on PATH is the only candidate — which is what
// the "resolves the pinned CLI from PATH" test pins down.
function supabaseInvocation(args) {
  const override = (process.env.SUPABASE_CLI ?? "").trim();

  if (override === "") {
    return { command: "supabase", argv: args };
  }
  if (/\.(?:mjs|cjs|js)$/i.test(override)) {
    return { command: process.execPath, argv: [override, ...args] };
  }
  return { command: override, argv: args };
}

function runSupabase(args, label, secrets) {
  const { command, argv } = supabaseInvocation(args);
  report(`running ${label}`);

  const result = spawnSync(command, argv, {
    encoding: "utf8",
    // A pre-deploy step has nobody to answer a prompt: stdin is closed rather
    // than left open, so the CLI sees end-of-input instead of hanging until the
    // platform's timeout.
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });

  if (result.stdout !== null && result.stdout !== "") {
    process.stdout.write(redact(result.stdout, secrets));
  }
  if (result.stderr !== null && result.stderr !== "") {
    process.stderr.write(redact(result.stderr, secrets));
  }

  if (result.error) {
    refuse(`${label} could not be run (${result.error.message})`);
  }
  if (result.status !== 0) {
    refuse(`${label} failed with exit status ${String(result.status)}`);
  }
}

function readInputs(environment) {
  const missing = REQUIRED_VARIABLES.filter((name) => (environment[name] ?? "").trim() === "");
  if (missing.length > 0) {
    refuse(`missing required environment variable(s): ${missing.join(", ")}`);
  }

  return {
    databaseUrl: environment.DATABASE_URL.trim(),
    railwayEnvironment: environment.RAILWAY_ENVIRONMENT_NAME.trim(),
    expectedEnvironment: environment.EXPECTED_ENVIRONMENT.trim(),
    expectedProjectRef: environment.EXPECTED_SUPABASE_PROJECT_REF.trim(),
  };
}

function main() {
  const inputs = readInputs(process.env);

  // Guard 1 — the same question the platform's environment list answers, asked
  // again from inside the process that is about to write.
  if (inputs.railwayEnvironment !== inputs.expectedEnvironment) {
    refuse(
      `running in Railway environment "${inputs.railwayEnvironment}" but this deployment expects "${inputs.expectedEnvironment}"`,
    );
  }

  // Guard 2 — the target database itself, which is the part a pasted variable
  // can silently disagree with.
  const url = readConnection(inputs.databaseUrl);
  const host = url.hostname.toLowerCase();
  const projectRef = supabaseProjectRef(url);

  if (projectRef !== null) {
    if (projectRef !== inputs.expectedProjectRef) {
      refuse(
        `DATABASE_URL points at Supabase project "${projectRef}" but this deployment expects "${inputs.expectedProjectRef}"`,
      );
    }
    report(`target is Supabase project ${projectRef} (${host})`);
  } else if (isLocalHost(host)) {
    // The rehearsal in docs/DEPLOY.md runs this image against the local stack,
    // where there is no project ref to compare. Local is the *only* host allowed
    // to skip the ref check.
    report(`target is local "${host}" — rehearsal, no Supabase project ref to check`);
  } else {
    refuse(
      `cannot derive a Supabase project ref from DATABASE_URL host "${host}" and it is not local, so it cannot be ` +
        `pinned to "${inputs.expectedProjectRef}" (a direct host is db.<ref>.supabase.co; a session-pooler ` +
        `username is postgres.<ref>)`,
    );
  }

  const secrets = [inputs.databaseUrl];
  if (url.password !== "") {
    secrets.push(url.password, encodeURIComponent(url.password));
  }

  // `migration list` first, for the record: it shows local and remote side by
  // side, so a deployment log answers "what was pending?" even when the push
  // that follows fails. It is also the cheap half — if the target is unreachable
  // or the credentials are wrong, this is where it shows up.
  runSupabase(["migration", "list", "--db-url", inputs.databaseUrl], "supabase migration list", secrets);
  runSupabase(["db", "push", "--db-url", inputs.databaseUrl], "supabase db push", secrets);

  report(`migrations applied to ${projectRef === null ? `local "${host}"` : `project ${projectRef}`}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Refusal ? error.message : `unexpected failure: ${String(error?.message ?? error)}`;
  process.stderr.write(`pre-deploy: ${message}\n`);
  process.exitCode = 1;
}
