#!/usr/bin/env node
//
// Data-plane readiness check for a Supabase project.
//
// Ticket #75 provisions production: a Supabase project with the full migration
// chain, the documented auth policy and one owner Account. Two of those live in
// the dashboard and no test suite can see them, so this script asks the project
// itself, from outside, and exits non-zero when an answer is wrong.
//
// It is deliberately not part of the server: it needs the service-role key, and
// it must be runnable against a project that has no deployed service yet. It
// uses plain `fetch` and the pinned Supabase CLI already on the operator's PATH.
//
// Inputs:
//   SUPABASE_URL                 required — https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    required — admin probes (never printed)
//   SUPABASE_ANON_KEY            optional — public settings; falls back to the service key
//   ADMIN_EMAIL                  required — the owner Account to verify
//   DATABASE_URL                 optional — when set, `supabase migration list` is compared
//                                with supabase/migrations/**. Never printed.
//   SUPABASE_CLI                 test seam only — the same convention as pre-deploy.mjs
//
// Flags:
//   --json                       machine-readable evidence, for the milestone record
//   --migration-list <file>      compare a saved `supabase migration list` table or the
//                                dashboard SQL Editor result instead of DATABASE_URL
//
// Exit status: 0 when every check passes (skips do not fail), 1 otherwise.

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

const SEED_IDENTITY_ID = "00000000-0000-0000-0000-000000000001";
const DEV_EMAIL = "admin@komyuter.ph";
const DEV_PASSWORD = "komyuter-admin-dev";
const PASSWORD_MINIMUM = 12;

class Refusal extends Error {}

function refuse(message) {
  throw new Refusal(message);
}

function required(name) {
  const value = (process.env[name] ?? "").trim();
  if (value === "") {
    refuse(`missing required environment variable: ${name}`);
  }
  return value;
}

function projectRef(url) {
  const match = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname.toLowerCase());
  return match === null ? null : match[1];
}

function redact(text, secrets) {
  let redacted = text;
  for (const secret of secrets) {
    if (secret !== "") {
      redacted = redacted.split(secret).join("[REDACTED]");
    }
  }
  return redacted;
}

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

function localMigrationVersions() {
  return readdirSync(MIGRATIONS_DIR)
    .map((name) => /^(\d{4})_.*\.sql$/.exec(name)?.[1])
    .filter((version) => version !== undefined)
    .sort();
}

function parseArgs(argv) {
  const options = { json: false, migrationList: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    }
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--migration-list") {
      const value = argv[index + 1];
      if (value === undefined || value.trim() === "") {
        refuse("--migration-list needs a file path");
      }
      options.migrationList = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--migration-list=")) {
      const value = argument.slice("--migration-list=".length);
      if (value.trim() === "") {
        refuse("--migration-list needs a file path");
      }
      options.migrationList = value;
      continue;
    }
    refuse(`unknown argument: ${argument}`);
  }
  return options;
}

// A saved `supabase migration list` table or the dashboard SQL Editor's
// one-version-per-line result. The remote column decides what is applied: a
// local version with an empty remote column is pending, not evidence.
function parseRemoteVersions(text) {
  const versions = new Set();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    if (trimmed.includes("|")) {
      const cells = trimmed.split("|").map((cell) => cell.trim());
      const remote = cells[1] ?? "";
      const match = /^(\d{4})(?:\b|_)/.exec(remote);
      if (match !== null) {
        versions.add(match[1]);
      }
      continue;
    }
    const match = /^["']?(\d{4})(?:["',]|$|_|\s)/.exec(trimmed);
    if (match !== null) {
      versions.add(match[1]);
    }
  }
  return versions;
}

async function readJson(response) {
  const text = await response.text();
  if (text === "") {
    return { text, json: null };
  }
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

function messageFrom(body, fallback) {
  if (body !== null && typeof body === "object") {
    for (const key of ["msg", "message", "error_description", "error"]) {
      const value = body[key];
      if (typeof value === "string" && value !== "") {
        return value;
      }
    }
  }
  return fallback;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const jsonMode = options.json;
  const migrationList = options.migrationList;
  const rawUrl = required("SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim() || serviceKey;
  const adminEmail = required("ADMIN_EMAIL");
  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    refuse("SUPABASE_URL is not a parseable URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    refuse(`SUPABASE_URL must be http(s), not "${url.protocol}"`);
  }
  const base = url.origin;
  const ref = projectRef(url);

  const publicHeaders = { apikey: anonKey };
  const adminHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
  const jsonHeaders = { ...adminHeaders, "Content-Type": "application/json" };
  const publicJsonHeaders = { ...publicHeaders, "Content-Type": "application/json" };

  const checks = [];
  const record = (id, ok, detail) => {
    checks.push({ id, ok, detail });
  };

  async function request(path, init = {}) {
    try {
      const response = await fetch(`${base}${path}`, init);
      const { text, json } = await readJson(response);
      return { status: response.status, text, json };
    } catch (error) {
      return {
        status: 0,
        text: "",
        json: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // 1. The public view of the auth policy.
  const settings = await request("/auth/v1/settings", {
    headers: publicHeaders,
  });
  if (settings.status !== 200 || settings.json === null) {
    const detail = settings.error ?? `GET /auth/v1/settings returned ${settings.status}`;
    record("auth-signups", false, detail);
    record("auth-confirm-email", false, detail);
  } else {
    record(
      "auth-signups",
      settings.json.disable_signup === true,
      `disable_signup is ${String(settings.json.disable_signup)}`,
    );
    record(
      "auth-confirm-email",
      settings.json.mailer_autoconfirm === false,
      `mailer_autoconfirm is ${String(settings.json.mailer_autoconfirm)}`,
    );
  }

  // 2. The password floor, probed behaviourally: GoTrue's public settings do not
  //    expose it, and the admin API is the path that sends no mail.
  async function createProbe(length) {
    const email = `policy-probe-${randomUUID()}@example.invalid`;
    const result = await request("/auth/v1/admin/users", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        email,
        password: "a".repeat(length),
        email_confirm: true,
      }),
    });
    const id = result.json?.id;
    return {
      created: result.status === 200 && typeof id === "string",
      id,
      status: result.status,
      message: messageFrom(result.json, result.text),
      error: result.error,
    };
  }

  async function deleteProbe(id) {
    const result = await request(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: adminHeaders,
    });
    if (result.status !== 200 && result.status !== 204) {
      throw new Error(
        `cleanup of probe user ${id} returned ${result.status}${
          result.error === undefined ? "" : ` (${result.error})`
        }`,
      );
    }
  }

  const probeUsers = [];
  let cleanupError = null;
  let passwordOutcome;

  try {
    const short = await createProbe(PASSWORD_MINIMUM - 1);
    if (short.created) {
      probeUsers.push(short.id);
      passwordOutcome = {
        ok: false,
        detail: `accepted an ${PASSWORD_MINIMUM - 1}-character password`,
      };
    } else if (short.status === 0) {
      passwordOutcome = {
        ok: false,
        detail: `createUser probe could not run (${short.error})`,
      };
    } else {
      const named = /at least (\d+) characters/i.exec(short.message);
      if (named !== null && Number(named[1]) !== PASSWORD_MINIMUM) {
        passwordOutcome = {
          ok: false,
          detail: `GoTrue enforces ${named[1]} characters, not ${PASSWORD_MINIMUM}`,
        };
      } else {
        const full = await createProbe(PASSWORD_MINIMUM);
        if (full.created) {
          probeUsers.push(full.id);
          passwordOutcome = {
            ok: true,
            detail: `${PASSWORD_MINIMUM - 1}-character password rejected; ${PASSWORD_MINIMUM}-character password accepted`,
          };
        } else {
          passwordOutcome = {
            ok: false,
            detail: `rejected a ${PASSWORD_MINIMUM}-character password${
              full.message === "" ? "" : `: ${full.message}`
            }`,
          };
        }
      }
    }
  } catch (error) {
    passwordOutcome = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    for (const id of probeUsers) {
      try {
        await deleteProbe(id);
      } catch (error) {
        cleanupError = error;
      }
    }
  }

  if (cleanupError !== null) {
    passwordOutcome = {
      ok: false,
      detail: `${passwordOutcome?.detail ?? "password probe"}; ${
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      }`,
    };
  }
  record("password-minimum", passwordOutcome.ok, passwordOutcome.detail);

  // 3. The owner Account. The email is the join key; the ownership property is
  //    `is_super_admin`, not a Role (ADR-0019).
  async function listUsers() {
    const users = [];
    const perPage = 1000;
    for (let page = 1; page <= 10; page += 1) {
      const result = await request(
        `/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
        { headers: adminHeaders },
      );
      if (result.status !== 200 || !Array.isArray(result.json?.users)) {
        refuse(
          result.error ??
            `GET /auth/v1/admin/users returned ${result.status}${
              result.text === "" ? "" : `: ${redact(result.text, [serviceKey])}`
            }`,
        );
      }
      const batch = result.json.users;
      users.push(...batch);
      if (batch.length < perPage) {
        break;
      }
    }
    return users;
  }

  let users = [];
  let usersReadable = false;
  try {
    users = await listUsers();
    usersReadable = true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    record("owner-account", false, detail);
    record("seed-identity", false, detail);
  }

  if (usersReadable) {
    const wanted = adminEmail.toLowerCase();
    const owner = users.find(
      (user) =>
        typeof user.email === "string" && user.email.toLowerCase() === wanted,
    );

    if (owner === undefined) {
      record("owner-account", false, `no auth identity for ${adminEmail}`);
    } else if (!owner.email_confirmed_at && !owner.confirmed_at) {
      record(
        "owner-account",
        false,
        `auth identity for ${adminEmail} is not email-confirmed`,
      );
    } else {
      const account = await request(
        `/rest/v1/admin_users?select=user_id,role_id,is_super_admin,is_active,must_change_password&user_id=eq.${encodeURIComponent(owner.id)}`,
        { headers: adminHeaders },
      );
      if (account.status !== 200 || !Array.isArray(account.json) || account.json.length !== 1) {
        record("owner-account", false, `${adminEmail} has no Account row`);
      } else {
        const row = account.json[0];
        if (row.is_super_admin !== true) {
          record("owner-account", false, `${adminEmail} is not the Super Admin`);
        } else if (row.is_active !== true) {
          record("owner-account", false, `${adminEmail}'s Account is inactive`);
        } else {
          record(
            "owner-account",
            true,
            `${adminEmail} is the active Super Admin (${owner.id})`,
          );
        }
      }
    }

    const seeded = users.some((user) => user.id === SEED_IDENTITY_ID);
    record(
      "seed-identity",
      !seeded,
      seeded
        ? `the seeded dev identity ${SEED_IDENTITY_ID} is present; seed.sql was applied`
        : "the seeded dev identity is absent",
    );
  }

  // 4. The documented dev credential must not be a working password. The same
  //    pair is refused by `POST /api/auth/login` when ALLOW_DEV_CREDENTIAL=false,
  //    but that route is not deployed yet at this stage — ask Auth itself.
  const devLogin = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: publicJsonHeaders,
    body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
  });
  if (devLogin.status === 200) {
    record("dev-credential", false, "the documented dev credential signs in");
  } else if (devLogin.status === 400 || devLogin.status === 401) {
    record("dev-credential", true, "the documented dev credential is refused");
  } else {
    record(
      "dev-credential",
      false,
      `unexpected status ${devLogin.status}${
        devLogin.error === undefined ? "" : ` (${devLogin.error})`
      }`,
    );
  }

  // 5. Migration parity. The CLI's own table is the evidence the runbook reads,
  //    so parse that rather than inventing a second history source. When the
  //    network cannot reach Postgres, `--migration-list` accepts the same table
  //    or the dashboard SQL Editor's one-version-per-line result.
  const versions = localMigrationVersions();
  if (migrationList !== null) {
    let text;
    try {
      text = readFileSync(migrationList, "utf8");
    } catch (error) {
      record(
        "migrations",
        false,
        `could not read --migration-list ${migrationList} (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
      text = null;
    }
    if (text !== null) {
      const applied = parseRemoteVersions(text);
      const missing = versions.filter((version) => !applied.has(version));
      const extra = [...applied].filter((version) => !versions.includes(version));
      if (missing.length > 0) {
        record(
          "migrations",
          false,
          `remote history is missing ${missing.join(", ")}`,
        );
      } else if (extra.length > 0) {
        record(
          "migrations",
          false,
          `remote history has version(s) with no local file: ${extra.join(", ")}`,
        );
      } else {
        record(
          "migrations",
          true,
          `all ${versions.length} local migrations are listed in ${migrationList}`,
        );
      }
    }
  } else if (databaseUrl === "") {
    record(
      "migrations",
      null,
      "skipped (DATABASE_URL not set; supabase migration list not compared)",
    );
  } else {
    const { command, argv } = supabaseInvocation([
      "migration",
      "list",
      "--db-url",
      databaseUrl,
    ]);
    const result = spawnSync(command, argv, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    const secrets = [databaseUrl];
    try {
      const parsed = new URL(databaseUrl);
      if (parsed.password !== "") {
        secrets.push(parsed.password, encodeURIComponent(parsed.password));
      }
    } catch {
      // A malformed URL is already reported by the CLI; do not echo it.
    }

    if (result.error) {
      record(
        "migrations",
        false,
        `supabase migration list could not run (${result.error.message})`,
      );
    } else if (result.status !== 0) {
      const detail = redact(
        `${result.stderr ?? ""}${result.stdout ?? ""}`.trim(),
        secrets,
      );
      record(
        "migrations",
        false,
        `supabase migration list failed with exit status ${String(result.status)}${
          detail === "" ? "" : `: ${detail}`
        }`,
      );
    } else {
      const applied = new Set();
      const extra = new Set();
      for (const line of (result.stdout ?? "").split(/\r?\n/)) {
        const cells = line.split("|").map((cell) => cell.trim());
        if (cells.length < 2) {
          continue;
        }
        const [local, remote] = cells;
        if (/^\d{4}$/.test(remote)) {
          if (/^\d{4}$/.test(local)) {
            applied.add(local);
            if (!versions.includes(local)) {
              extra.add(local);
            }
          } else if (!versions.includes(remote)) {
            // A version applied remotely with no local column: SQL that is not
            // in source. Flag it rather than silently accepting it.
            extra.add(remote);
          }
        }
        if (/^\d{4}$/.test(local) && !versions.includes(local)) {
          extra.add(local);
        }
      }
      const missing = versions.filter((version) => !applied.has(version));
      if (missing.length > 0) {
        record(
          "migrations",
          false,
          `remote history is missing ${missing.join(", ")}`,
        );
      } else if (extra.size > 0) {
        record(
          "migrations",
          false,
          `remote history has version(s) with no local file: ${[...extra].join(", ")}`,
        );
      } else {
        record(
          "migrations",
          true,
          `all ${versions.length} local migrations are applied`,
        );
      }
    }
  }

  const failed = checks.filter((entry) => entry.ok === false).length;
  const skipped = checks.filter((entry) => entry.ok === null).length;
  const passed = checks.length - failed - skipped;
  const report = {
    target: base,
    projectRef: ref,
    ok: failed === 0,
    checks,
  };

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const label = (ok) => (ok === null ? "SKIP" : ok ? "PASS" : "FAIL");
    process.stdout.write(
      `data-plane: ${base}${ref === null ? "" : ` (project ${ref})`}\n`,
    );
    for (const entry of checks) {
      process.stdout.write(`${label(entry.ok)} ${entry.id}: ${entry.detail}\n`);
    }
    process.stdout.write(
      `${passed} passed, ${failed} failed, ${skipped} skipped\n`,
    );
  }

  process.exitCode = report.ok ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message =
    error instanceof Refusal
      ? error.message
      : `unexpected failure: ${error instanceof Error ? error.message : String(error)}`;
  process.stderr.write(`data-plane: ${message}\n`);
  process.exitCode = 1;
}
