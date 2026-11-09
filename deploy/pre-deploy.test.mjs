// Unit tests for deploy/pre-deploy.mjs (ADR-0022 §3, docs/DEPLOY.md §3.4).
//
// Every test drives the runner as a child process with a stand-in Supabase CLI,
// because the runner's whole contract is its environment, its exit code and the
// arguments it hands the CLI. Reaching inside it for those would test the
// implementation instead of the behaviour, and the three things that matter —
// refuse a wrong target, apply the chain, never echo the credential — are all
// observable from outside.
//
// The stand-in is an executable Node script, so no network and no real CLI is
// involved. Note there is no `supabase` binary in this repository at all: the
// only one that ever exists is the pinned CLI in the runtime image.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const RUNNER = fileURLToPath(new URL("./pre-deploy.mjs", import.meta.url));

// The staging project from the M4 plan. The production ref is not known to this
// repository (it is created per environment), which is why it is a variable
// here rather than a literal the runner could have been written to expect.
const PROJECT_REF = "prmccdmsqtywprmfaluf";
const OTHER_PROJECT_REF = "zzzzzzzzzzzzzzzzzzzz";

const DATABASE_URL = `postgresql://postgres:s3cret-password@db.${PROJECT_REF}.supabase.co:5432/postgres`;
const POOLER_URL = `postgresql://postgres.${PROJECT_REF}:s3cret-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
const WRONG_REF_URL = `postgresql://postgres:s3cret-password@db.${OTHER_PROJECT_REF}.supabase.co:5432/postgres`;
const WRONG_POOLER_REF_URL = `postgresql://postgres.${OTHER_PROJECT_REF}:s3cret-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
const REMOTE_UNPINNABLE_URL = "postgresql://postgres:s3cret-password@db.example.com:5432/postgres";
const REHEARSAL_URL = "postgresql://postgres:postgres@host.docker.internal:54322/postgres";
const LOOPBACK_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const STAGING_ENVIRONMENT = {
  RAILWAY_ENVIRONMENT_NAME: "staging",
  EXPECTED_ENVIRONMENT: "staging",
  EXPECTED_SUPABASE_PROJECT_REF: PROJECT_REF,
};

// A CommonJS script so the same source can be executed two ways: as the
// `SUPABASE_CLI` target through `process.execPath` (portable, including the
// Windows checkout this repository is developed on), and — on POSIX only — as an
// extensionless `supabase` on `PATH`, which is how the image resolves it.
const STUB_SOURCE = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");

const argv = process.argv.slice(2);

if (process.env.STUB_SUPABASE_LOG) {
  appendFileSync(process.env.STUB_SUPABASE_LOG, JSON.stringify({ argv }) + "\\n");
}

process.stdout.write("stub supabase: " + argv.join(" ") + "\\n");

const failOn = process.env.STUB_SUPABASE_FAIL_ON;
if (failOn && argv.join(" ").includes(failOn)) {
  process.stderr.write("stub supabase: deliberate failure\\n");
  process.exit(Number(process.env.STUB_SUPABASE_EXIT || "1"));
}

process.stdout.write("Remote database is up to date.\\n");
`;

// Nothing inherited from the developer's shell may satisfy a guard, or a test
// could pass for the wrong reason.
const INHERITED_AND_IGNORED = [
  ...Object.keys(STAGING_ENVIRONMENT),
  "DATABASE_URL",
  "SUPABASE_CLI",
  "STUB_SUPABASE_LOG",
  "STUB_SUPABASE_FAIL_ON",
  "STUB_SUPABASE_EXIT",
];

function baseEnvironment() {
  const environment = { ...process.env };
  for (const name of INHERITED_AND_IGNORED) delete environment[name];
  return environment;
}

// Each test gets its own temp directory: a log only the stub of that test can
// append to, and a stub of its own.
function scratch(t) {
  const directory = mkdtempSync(join(tmpdir(), "komyuter-pre-deploy-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const cli = join(directory, "supabase-stub.cjs");
  writeFileSync(cli, STUB_SOURCE, "utf8");

  const log = join(directory, "calls.log");

  return {
    directory,
    cli,
    log,
    pathStub() {
      const extensionless = join(directory, "supabase");
      copyFileSync(cli, extensionless);
      chmodSync(extensionless, 0o755);
      return extensionless;
    },
    calls() {
      if (!existsSync(log)) return [];
      return readFileSync(log, "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line).argv);
    },
  };
}

function run(t, environment, { stub = true } = {}) {
  const files = scratch(t);
  const childEnvironment = {
    ...baseEnvironment(),
    ...(stub ? { SUPABASE_CLI: files.cli } : {}),
    STUB_SUPABASE_LOG: files.log,
    ...environment,
  };

  const result = spawnSync(process.execPath, [RUNNER], {
    encoding: "utf8",
    env: childEnvironment,
    timeout: 20_000,
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    calls: files.calls(),
  };
}

test("refuses when a required variable is missing", (t) => {
  const result = run(t, { ...STAGING_ENVIRONMENT, DATABASE_URL: DATABASE_URL, RAILWAY_ENVIRONMENT_NAME: "" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RAILWAY_ENVIRONMENT_NAME/);
  assert.deepEqual(result.calls, [], "the CLI must not run against an unvalidated target");
});

test("names every missing required variable at once", (t) => {
  const result = run(t, { DATABASE_URL: DATABASE_URL });

  assert.notEqual(result.status, 0);
  for (const name of ["RAILWAY_ENVIRONMENT_NAME", "EXPECTED_ENVIRONMENT", "EXPECTED_SUPABASE_PROJECT_REF"]) {
    assert.match(result.stderr, new RegExp(name), `stderr should name ${name}`);
  }
  assert.deepEqual(result.calls, []);
});

test("refuses when the Railway environment is not the expected one", (t) => {
  const result = run(t, { ...STAGING_ENVIRONMENT, DATABASE_URL: DATABASE_URL, RAILWAY_ENVIRONMENT_NAME: "production" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production/);
  assert.match(result.stderr, /staging/);
  assert.deepEqual(result.calls, []);
});

test("refuses a direct host whose project ref is not the expected one", (t) => {
  const result = run(t, { ...STAGING_ENVIRONMENT, DATABASE_URL: WRONG_REF_URL });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(OTHER_PROJECT_REF));
  assert.match(result.stderr, new RegExp(PROJECT_REF));
  assert.deepEqual(result.calls, []);
});

test("refuses a session-pooler username whose project ref is not the expected one", (t) => {
  const result = run(t, { ...STAGING_ENVIRONMENT, DATABASE_URL: WRONG_POOLER_REF_URL });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(OTHER_PROJECT_REF));
  assert.deepEqual(result.calls, []);
});

test("refuses a remote host whose project ref cannot be derived", (t) => {
  const result = run(t, { ...STAGING_ENVIRONMENT, DATABASE_URL: REMOTE_UNPINNABLE_URL });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /db\.example\.com/);
  assert.deepEqual(result.calls, []);
});

test("applies the chain against a direct host carrying the expected ref", (t) => {
  const result = run(t, { ...STAGING_ENVIRONMENT, DATABASE_URL: DATABASE_URL });

  assert.equal(result.status, 0);
  assert.deepEqual(result.calls, [
    ["migration", "list", "--db-url", DATABASE_URL],
    ["db", "push", "--db-url", DATABASE_URL],
  ]);
  assert.match(result.stdout, /Remote database is up to date\./);
});

test("derives the ref from a session-pooler username", (t) => {
  const result = run(t, { ...STAGING_ENVIRONMENT, DATABASE_URL: POOLER_URL });

  assert.equal(result.status, 0);
  assert.deepEqual(result.calls, [
    ["migration", "list", "--db-url", POOLER_URL],
    ["db", "push", "--db-url", POOLER_URL],
  ]);
});

test("allows a local rehearsal against host.docker.internal without a project ref", (t) => {
  const result = run(t, { ...STAGING_ENVIRONMENT, DATABASE_URL: REHEARSAL_URL });

  assert.equal(result.status, 0);
  assert.equal(result.calls.length, 2);
});

test("allows a local rehearsal against loopback without a project ref", (t) => {
  const result = run(t, { ...STAGING_ENVIRONMENT, DATABASE_URL: LOOPBACK_URL });

  assert.equal(result.status, 0);
  assert.equal(result.calls.length, 2);
});

test("refuses a local-looking host that only ends in a loopback name", (t) => {
  const result = run(t, {
    ...STAGING_ENVIRONMENT,
    DATABASE_URL: "postgresql://postgres:s3cret-password@localhost.example.com:5432/postgres",
  });

  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, [], "a suffix match would be a remote-host bypass");
});

test("never prints the connection string", (t) => {
  const result = run(t, { ...STAGING_ENVIRONMENT, DATABASE_URL: POOLER_URL });

  assert.equal(result.status, 0, "the CLI echoes its argv, so this is the run that would leak");
  assert.ok(!result.output.includes("s3cret-password"), "the password must not appear in the output");
  assert.ok(!result.output.includes(POOLER_URL), "the connection string must not appear in the output");
});

test("exits non-zero when `migration list` fails, before pushing", (t) => {
  const result = run(t, {
    ...STAGING_ENVIRONMENT,
    DATABASE_URL: DATABASE_URL,
    STUB_SUPABASE_FAIL_ON: "migration list",
  });

  assert.notEqual(result.status, 0);
  assert.equal(result.calls.length, 1, "a failed listing must not be followed by a push");
  assert.equal(result.calls[0][0], "migration");
  assert.ok(!result.output.includes("s3cret-password"));
});

test("exits non-zero when `db push` fails", (t) => {
  const result = run(t, {
    ...STAGING_ENVIRONMENT,
    DATABASE_URL: DATABASE_URL,
    STUB_SUPABASE_FAIL_ON: "db push",
    STUB_SUPABASE_EXIT: "3",
  });

  assert.notEqual(result.status, 0);
  assert.equal(result.calls.length, 2);
  assert.match(result.stderr, /db push|supabase db push/);
});

test(
  "resolves the pinned CLI from PATH when no override is set",
  // The image sets no `SUPABASE_CLI`, so `supabase` on PATH is the only thing
  // the pre-deploy step can run there. This is the one test that proves the
  // default lookup rather than the test seam. Skipped on Windows, which cannot
  // execute a `#!` script directly.
  { skip: process.platform === "win32" ? "the PATH stub is a #! script" : false },
  (t) => {
    const files = scratch(t);
    files.pathStub();

    const result = spawnSync(process.execPath, [RUNNER], {
      encoding: "utf8",
      env: {
        ...baseEnvironment(),
        ...STAGING_ENVIRONMENT,
        DATABASE_URL: DATABASE_URL,
        STUB_SUPABASE_LOG: files.log,
        PATH: `${files.directory}${delimiter}${process.env.PATH ?? ""}`,
      },
      timeout: 20_000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(files.calls().length, 2);
  },
);
