import { describe, expect, it } from "vitest";
import {
  NonLocalDatabaseError,
  assertLocalDatabaseUrl,
  isLocalDatabaseUrl,
} from "../helpers/local-db-guard";

/**
 * The guard decides whether the integration fixtures may DROP/CREATE databases
 * and delete auth rows, so its rejections matter more than its acceptances.
 */
describe("local database guard", () => {
  const local = [
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://postgres:postgres@localhost:54322/postgres",
    "postgresql://postgres:postgres@LOCALHOST:54322/postgres",
    "postgresql://postgres:postgres@[::1]:54322/postgres",
    "postgresql://postgres:postgres@127.0.0.1:54322/komyuter_test",
  ];

  const notLocal = [
    // The shape a Supabase Cloud connection string actually has.
    "postgresql://postgres.abcdefghijkl:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    "postgresql://postgres:secret@db.abcdefghijkl.supabase.co:5432/postgres",
    "postgresql://postgres:secret@10.0.0.5:5432/postgres",
    "postgresql://postgres:secret@host.docker.internal:54322/postgres",
    // 127.0.0.1.evil.com must not pass by prefix.
    "postgresql://postgres:secret@127.0.0.1.evil.com:5432/postgres",
    "",
    "not-a-url",
  ];

  it("accepts loopback hosts", () => {
    for (const url of local) {
      expect(isLocalDatabaseUrl(url), url).toBe(true);
      expect(() => assertLocalDatabaseUrl(url, "test")).not.toThrow();
    }
  });

  it("rejects every non-loopback host", () => {
    for (const url of notLocal) {
      expect(isLocalDatabaseUrl(url), url).toBe(false);
      expect(() => assertLocalDatabaseUrl(url, "test"), url).toThrow(
        NonLocalDatabaseError,
      );
    }
  });

  it("names the offending host and the caller in the failure", () => {
    expect(() =>
      assertLocalDatabaseUrl(
        "postgresql://postgres:secret@db.abcdefghijkl.supabase.co:5432/postgres",
        "createDevPool",
      ),
    ).toThrow(/createDevPool.*db\.abcdefghijkl\.supabase\.co/);
  });

  it("does not leak the password into the failure message", () => {
    let message = "";
    try {
      assertLocalDatabaseUrl(
        "postgresql://postgres:sup3r-s3cret@db.example.com:5432/postgres",
        "createTestPool",
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("sup3r-s3cret");
    expect(message).toContain("db.example.com");
  });
});
