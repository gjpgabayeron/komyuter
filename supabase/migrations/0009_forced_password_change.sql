-- Migration 0009: Forced Password Change (`admin_users.must_change_password`).
--
-- Decision: docs/adr/0019-authorization-model.md (2026-10-31 M2b amendment §4),
-- plus CONTEXT.md's **Temporary Password** and **Forced Password Change**.
--
-- A Temporary Password is a handover, not a permanent credential. When an
-- Account is invited (or force-reset, ticket #44) the flag is set, and until the
-- Account replaces the password the guard admits only its own identity lookup
-- and the password-change action — every other admin route answers
-- `403 PASSWORD_CHANGE_REQUIRED`. The bypass is declared per route rather than
-- matched by URL, so a route added later cannot silently inherit it.
--
-- The column defaults to false and nothing is backfilled: every existing
-- Account already holds a password it chose, so none of them is gated. The
-- column is not part of the owner-protection trigger — the Super Admin is never
-- force-reset by anyone (ADR-0019 §5), and its own credential changes through
-- the self-service flow.

ALTER TABLE "admin_users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;
