// Hermetic tests for deploy/check-data-plane.mjs.
//
// The checker is an operator preflight: it probes a live Supabase project from
// outside, so the tests stand a fake Auth/PostgREST server in for the real one
// and a stub Supabase CLI in for `migration list`. Nothing here needs a
// database, a cloud project or a network.
//
// The runner is a child process, and the fake server lives in this process, so
// every case uses `spawn` rather than `spawnSync`: a synchronous wait would
// block the event loop that has to answer the child's requests.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CHECKER = fileURLToPath(new URL("./check-data-plane.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const SEED_ID = "00000000-0000-0000-0000-000000000001";
const OWNER_EMAIL = "owner@example.com";
const DEV_EMAIL = "admin@komyuter.ph";
const DEV_PASSWORD = "komyuter-admin-dev";
const SERVICE_KEY = "service-role-secret";
const ANON_KEY = "anon-secret";
const DATABASE_URL =
  "postgresql://postgres:s3cret-password@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres";

const LOCAL_VERSIONS = readdirSync(MIGRATIONS_DIR)
  .map((name) => /^(\d{4})_.*\.sql$/.exec(name)?.[1])
  .filter((version) => version !== undefined)
  .sort();

// The parity fixtures stand in for a **remote-only** row, so the version they use
// must not exist in `supabase/migrations/` — otherwise the checker correctly finds
// a local file and the case stops being the case. It is derived rather than
// hardcoded because a transient drill migration (`docs/ROLLBACK.md`) is a real
// local file: when `9999_drill_…` is present, a fixture that pinned `9999` would
// silently invert this suite.
const ABSENT_VERSION = (() => {
  for (let candidate = 9999; candidate >= 0; candidate -= 1) {
    const version = String(candidate).padStart(4, "0");
    if (!LOCAL_VERSIONS.includes(version)) {
      return version;
    }
  }
  throw new Error("every four-digit migration version exists locally");
})();

const STUB_SOURCE = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const argv = process.argv.slice(2);
if (process.env.STUB_SUPABASE_LOG) {
  appendFileSync(process.env.STUB_SUPABASE_LOG, JSON.stringify({ argv }) + "\\n");
}
process.stdout.write(process.env.STUB_MIGRATION_TABLE ?? "");
`;

function migrationTable({ remote = LOCAL_VERSIONS, extra = [], remoteOnly = [] } = {}) {
  const rows = LOCAL_VERSIONS.map(
    (version, index) =>
      `${version}  | ${remote.includes(version) ? version : ""}   | 2026-01-0${(index % 9) + 1}`,
  );
  const extras = extra.map(
    (version) => `${version}  | ${version}   | 2026-01-09`,
  );
  const onlyRemote = remoteOnly.map(
    (version) => `      | ${version}   | 2026-01-10`,
  );
  return [
    "Local | Remote | Time (UTC)",
    "------|--------|-----------",
    ...rows,
    ...extras,
    ...onlyRemote,
  ].join("\n");
}

function baseEnvironment() {
  const environment = { ...process.env };
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "ADMIN_EMAIL",
    "DATABASE_URL",
    "SUPABASE_CLI",
    "STUB_SUPABASE_LOG",
    "STUB_MIGRATION_TABLE",
  ]) {
    delete environment[name];
  }
  return environment;
}

function scratch(t) {
  const directory = mkdtempSync(join(tmpdir(), "komyuter-data-plane-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const cli = join(directory, "supabase-stub.cjs");
  writeFileSync(cli, STUB_SOURCE, "utf8");
  chmodSync(cli, 0o755);
  return { directory, cli, log: join(directory, "calls.log") };
}

function jsonResponse(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
  });
  response.end(text);
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
  });
}

async function startFakeSupabase(t, options = {}) {
  const settings = {
    disable_signup: options.disableSignup ?? true,
    mailer_autoconfirm: options.mailerAutoconfirm ?? false,
  };
  const minimumLength = options.passwordMinLength ?? 12;
  const devCredentialAccepted = options.devCredentialAccepted ?? false;
  const failDelete = options.failDelete ?? false;

  const users = new Map();
  const owner =
    options.owner === null
      ? null
      : {
          id: OWNER_ID,
          email: options.ownerEmail ?? OWNER_EMAIL,
          email_confirmed_at:
            options.ownerConfirmed === false ? null : "2026-01-01T00:00:00Z",
          confirmed_at: "2026-01-01T00:00:00Z",
          aud: "authenticated",
          role: "authenticated",
          user_metadata: { full_name: "Owner" },
        };
  if (owner !== null) {
    users.set(owner.id, owner);
  }
  if (options.seedIdentity === true) {
    users.set(SEED_ID, {
      id: SEED_ID,
      email: DEV_EMAIL,
      email_confirmed_at: "2026-01-01T00:00:00Z",
      confirmed_at: "2026-01-01T00:00:00Z",
    });
  }

  const ownerAccount = {
    user_id: OWNER_ID,
    role_id: "administrator",
    is_super_admin: options.ownerSuperAdmin ?? true,
    is_active: options.ownerActive ?? true,
    must_change_password: false,
  };
  const calls = [];

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    calls.push({ method: request.method, path: url.pathname, search: url.search });

    if (request.method === "GET" && url.pathname === "/auth/v1/settings") {
      jsonResponse(response, 200, settings);
      return;
    }

    if (request.method === "GET" && url.pathname === "/auth/v1/admin/users") {
      jsonResponse(response, 200, { users: [...users.values()], aud: "authenticated" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/auth/v1/admin/users") {
      const body = JSON.parse((await readBody(request)) || "{}");
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < minimumLength) {
        jsonResponse(response, 422, {
          code: 422,
          error_code: "weak_password",
          msg: `Password should be at least ${minimumLength} characters.`,
        });
        return;
      }
      const id =
        body.email === DEV_EMAIL
          ? "22222222-2222-4222-8222-222222222222"
          : `probe-${users.size + 1}`;
      const user = {
        id,
        email: body.email,
        email_confirmed_at: "2026-01-01T00:00:00Z",
        confirmed_at: "2026-01-01T00:00:00Z",
      };
      users.set(id, user);
      jsonResponse(response, 200, user);
      return;
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/auth/v1/admin/users/")) {
      if (failDelete) {
        jsonResponse(response, 500, { message: "delete refused" });
        return;
      }
      users.delete(url.pathname.split("/").at(-1));
      jsonResponse(response, 200, {});
      return;
    }

    if (request.method === "POST" && url.pathname === "/auth/v1/token") {
      const body = JSON.parse((await readBody(request)) || "{}");
      if (
        devCredentialAccepted &&
        body.email === DEV_EMAIL &&
        body.password === DEV_PASSWORD
      ) {
        jsonResponse(response, 200, { access_token: "probe-token" });
        return;
      }
      jsonResponse(response, 400, {
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/rest/v1/admin_users") {
      const filter = url.searchParams.get("user_id") ?? "";
      const id = filter.startsWith("eq.") ? filter.slice(3) : "";
      const rows =
        id === OWNER_ID
          ? [ownerAccount]
          : id === SEED_ID && options.seedIdentity === true
            ? [{ ...ownerAccount, user_id: SEED_ID }]
            : [];
      jsonResponse(response, 200, rows);
      return;
    }

    jsonResponse(response, 404, { message: "not found" });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  return {
    url: `http://127.0.0.1:${address.port}`,
    users,
    calls,
  };
}

function runChecker(t, server, options = {}) {
  const files = scratch(t);
  const environment = {
    ...baseEnvironment(),
    SUPABASE_URL: server.url,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    SUPABASE_ANON_KEY: ANON_KEY,
    ADMIN_EMAIL: options.adminEmail ?? OWNER_EMAIL,
  };

  if (options.migrations !== false) {
    environment.DATABASE_URL = options.databaseUrl ?? DATABASE_URL;
    environment.SUPABASE_CLI = files.cli;
    environment.STUB_SUPABASE_LOG = files.log;
    environment.STUB_MIGRATION_TABLE =
      options.migrationTable ?? migrationTable();
  }

  const args = [CHECKER];
  if (options.human !== true) {
    args.push("--json");
  }
  if (options.migrationList !== undefined) {
    const migrationFile = join(files.directory, "remote-migrations.txt");
    writeFileSync(migrationFile, options.migrationList, "utf8");
    args.push("--migration-list", migrationFile);
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 20_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, output: `${stdout}${stderr}` });
    });
  });
}

function parseJson(result) {
  return JSON.parse(result.stdout);
}

function check(report, id) {
  const found = report.checks.find((entry) => entry.id === id);
  assert.notEqual(found, undefined, `missing check ${id}`);
  return found;
}

test("passes when the auth policy, owner, seed state and migrations are right", async (t) => {
  const server = await startFakeSupabase(t);
  const result = await runChecker(t, server);
  assert.equal(result.status, 0, result.output);
  const report = parseJson(result);
  assert.equal(report.ok, true);
  assert.equal(check(report, "auth-signups").ok, true);
  assert.equal(check(report, "auth-confirm-email").ok, true);
  assert.equal(check(report, "password-minimum").ok, true);
  assert.equal(check(report, "owner-account").ok, true);
  assert.equal(check(report, "seed-identity").ok, true);
  assert.equal(check(report, "dev-credential").ok, true);
  assert.equal(check(report, "migrations").ok, true);

  assert.equal(
    server.calls.filter((call) => call.method === "POST" && call.path === "/auth/v1/admin/users").length,
    2,
    "the probe should try an 11-character and a 12-character password",
  );
  assert.equal(
    server.calls.filter((call) => call.method === "DELETE").length,
    1,
    "only the accepted 12-character probe user needs deleting",
  );
  assert.equal(
    [...server.users.values()].some((user) => String(user.email ?? "").startsWith("policy-probe-")),
    false,
    "probe users must be deleted",
  );
});

test("fails when signups are enabled", async (t) => {
  const server = await startFakeSupabase(t, { disableSignup: false });
  const result = await runChecker(t, server);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  assert.equal(report.ok, false);
  assert.equal(check(report, "auth-signups").ok, false);
  assert.match(check(report, "auth-signups").detail, /disable_signup/);
});

test("fails when email confirmation is off", async (t) => {
  const server = await startFakeSupabase(t, { mailerAutoconfirm: true });
  const result = await runChecker(t, server);
  assert.equal(result.status, 1);
  assert.equal(check(parseJson(result), "auth-confirm-email").ok, false);
});

test("fails when an 11-character password is accepted", async (t) => {
  const server = await startFakeSupabase(t, { passwordMinLength: 6 });
  const result = await runChecker(t, server);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  const password = check(report, "password-minimum");
  assert.equal(password.ok, false);
  assert.match(password.detail, /accepted an 11-character password/);

  assert.equal(
    server.calls.filter((call) => call.method === "DELETE").length,
    1,
    "the accepted probe user must still be deleted",
  );
  assert.equal(
    [...server.users.values()].some((user) => String(user.email ?? "").startsWith("policy-probe-")),
    false,
  );
});

test("fails when the minimum is 13 rather than 12", async (t) => {
  const server = await startFakeSupabase(t, { passwordMinLength: 13 });
  const result = await runChecker(t, server);
  assert.equal(result.status, 1);
  const password = check(parseJson(result), "password-minimum");
  assert.equal(password.ok, false);
  assert.match(password.detail, /13/);
});

test("fails when the owner Account is missing", async (t) => {
  const server = await startFakeSupabase(t, { owner: null });
  const result = await runChecker(t, server);
  assert.equal(result.status, 1);
  const owner = check(parseJson(result), "owner-account");
  assert.equal(owner.ok, false);
  assert.match(owner.detail, /no auth identity/);
});

test("fails when the owner is not a Super Admin", async (t) => {
  const server = await startFakeSupabase(t, { ownerSuperAdmin: false });
  const result = await runChecker(t, server);
  assert.equal(result.status, 1);
  assert.equal(check(parseJson(result), "owner-account").ok, false);
});

test("fails when the owner Account is inactive", async (t) => {
  const server = await startFakeSupabase(t, { ownerActive: false });
  const result = await runChecker(t, server);
  assert.equal(result.status, 1);
  assert.equal(check(parseJson(result), "owner-account").ok, false);
});

test("fails when the seeded dev identity is present", async (t) => {
  const server = await startFakeSupabase(t, { seedIdentity: true });
  const result = await runChecker(t, server);
  assert.equal(result.status, 1);
  const seed = check(parseJson(result), "seed-identity");
  assert.equal(seed.ok, false);
  assert.match(seed.detail, new RegExp(SEED_ID));
});

test("fails when the documented dev credential signs in", async (t) => {
  const server = await startFakeSupabase(t, { devCredentialAccepted: true });
  const result = await runChecker(t, server);
  assert.equal(result.status, 1);
  assert.equal(check(parseJson(result), "dev-credential").ok, false);
});

test("fails when a migration is not applied remotely", async (t) => {
  const server = await startFakeSupabase(t);
  const result = await runChecker(t, server, {
    migrationTable: migrationTable({ remote: LOCAL_VERSIONS.slice(1) }),
  });
  assert.equal(result.status, 1);
  const migrations = check(parseJson(result), "migrations");
  assert.equal(migrations.ok, false);
  assert.match(migrations.detail, new RegExp(LOCAL_VERSIONS[0]));
});

test("fails when the remote history has a version with no local file", async (t) => {
  const server = await startFakeSupabase(t);
  const result = await runChecker(t, server, {
    migrationTable: migrationTable({ extra: [ABSENT_VERSION] }),
  });
  assert.equal(result.status, 1);
  const migrations = check(parseJson(result), "migrations");
  assert.equal(migrations.ok, false);
  assert.match(migrations.detail, new RegExp(ABSENT_VERSION));
});

test("fails when a remote-only version has no local file", async (t) => {
  const server = await startFakeSupabase(t);
  const result = await runChecker(t, server, {
    migrationTable: migrationTable({ remoteOnly: [ABSENT_VERSION] }),
  });
  assert.equal(result.status, 1);
  const migrations = check(parseJson(result), "migrations");
  assert.equal(migrations.ok, false);
  assert.match(migrations.detail, new RegExp(ABSENT_VERSION));
});

test("accepts a copied migration list when DATABASE_URL is unavailable", async (t) => {
  const server = await startFakeSupabase(t);
  const result = await runChecker(t, server, {
    migrations: false,
    migrationList: LOCAL_VERSIONS.join("\n"),
  });
  assert.equal(result.status, 0, result.output);
  const migrations = check(parseJson(result), "migrations");
  assert.equal(migrations.ok, true);
});

test("fails when a copied migration list is missing a version", async (t) => {
  const server = await startFakeSupabase(t);
  const result = await runChecker(t, server, {
    migrations: false,
    migrationList: LOCAL_VERSIONS.slice(1).join("\n"),
  });
  assert.equal(result.status, 1);
  const migrations = check(parseJson(result), "migrations");
  assert.equal(migrations.ok, false);
  assert.match(migrations.detail, new RegExp(LOCAL_VERSIONS[0]));
});

test("accepts a saved supabase migration list table", async (t) => {
  const server = await startFakeSupabase(t);
  const result = await runChecker(t, server, {
    migrations: false,
    migrationList: migrationTable(),
  });
  assert.equal(result.status, 0, result.output);
  assert.equal(check(parseJson(result), "migrations").ok, true);
});

test("fails when a copied list has a version with no local file", async (t) => {
  const server = await startFakeSupabase(t);
  const result = await runChecker(t, server, {
    migrations: false,
    migrationList: `${LOCAL_VERSIONS.join("\n")}\n${ABSENT_VERSION}`,
  });
  assert.equal(result.status, 1);
  const migrations = check(parseJson(result), "migrations");
  assert.equal(migrations.ok, false);
  assert.match(migrations.detail, new RegExp(ABSENT_VERSION));
});

test("skips migration parity when DATABASE_URL is absent", async (t) => {
  const server = await startFakeSupabase(t);
  const result = await runChecker(t, server, { migrations: false });
  assert.equal(result.status, 0, result.output);
  const report = parseJson(result);
  assert.equal(report.ok, true);
  assert.equal(check(report, "migrations").ok, null);
  assert.match(check(report, "migrations").detail, /skipped/);
});

test("never prints the service key, anon key or database URL", async (t) => {
  const server = await startFakeSupabase(t, { disableSignup: false });
  const result = await runChecker(t, server);
  assert.equal(result.status, 1);
  assert.equal(result.output.includes(SERVICE_KEY), false);
  assert.equal(result.output.includes(ANON_KEY), false);
  assert.equal(result.output.includes(DATABASE_URL), false);
  assert.equal(result.output.includes("s3cret-password"), false);
});

test("human output is a readable checklist", async (t) => {
  const server = await startFakeSupabase(t, { disableSignup: false });
  const result = await runChecker(t, server, { human: true });
  assert.equal(result.status, 1);
  assert.match(result.output, /PASS auth-confirm-email/);
  assert.match(result.output, /FAIL auth-signups/);
  assert.match(result.output, /passed/);
  assert.match(result.output, /failed/);
});
