import { z } from "zod";
import { extractBearerToken, isAdminUserId } from "./auth";
import type { AppDeps, AppInstance } from "./app";
import { forbidden, unauthorized } from "./errors";
import {
  DENIAL_MIN_MS,
  createLoginThrottler,
  normalizeAccount,
} from "./throttle";
import { eventLog, type SecurityOutcome } from "./security-events";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** FR-005: every denial carries the same body, so throttling stays invisible. */
const UNIFIED_DENIAL = "Invalid email or password";

/** R4: the documented dev credential — refused unless ALLOW_DEV_CREDENTIAL=true. */
const DEV_CREDENTIAL = {
  email: "admin@komyuter.ph",
  password: "komyuter-admin-dev",
};

function fullNameOf(user: { user_metadata?: { full_name?: unknown } }): string {
  const value = user.user_metadata?.full_name;
  return typeof value === "string" ? value : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function registerAuth(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db, supabase, env } = deps;
  // Fresh throttler per app instance (each buildApp() gets isolated state —
  // also gives the integration tests per-app isolation).
  const throttler = createLoginThrottler();

  app.post(
    "/api/auth/login",
    { schema: { body: loginSchema } },
    async (request) => {
      const { email, password } = request.body;
      const accountKey = normalizeAccount(email);
      const sourceKey = request.ip;

      const deny = async (
        event: "security.sign_in_failure" | "security.sign_in_throttled",
        outcome: SecurityOutcome,
        account: string,
        recordFailure: boolean,
      ): Promise<never> => {
        if (recordFailure) {
          throttler.recordFailure(accountKey);
          throttler.recordFailure(sourceKey);
        }
        await sleep(DENIAL_MIN_MS);
        eventLog(request, event, outcome, account);
        throw unauthorized(UNIFIED_DENIAL);
      };

      // FR-004 pre-check: blocked account or source → indistinguishable denial.
      if (throttler.isBlocked(accountKey) || throttler.isBlocked(sourceKey)) {
        await deny("security.sign_in_throttled", "throttled", email, false);
      }

      // R4 dev-credential gate: the documented credential is refused unless
      // explicitly allowed for local development.
      const isDevCredential =
        normalizeAccount(email) === DEV_CREDENTIAL.email &&
        password === DEV_CREDENTIAL.password;
      if (isDevCredential && !env.ALLOW_DEV_CREDENTIAL) {
        await deny("security.sign_in_failure", "denied", email, true);
      }

      const { data: sessionData, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !sessionData.session) {
        // Wrong password, unconfirmed email, deactivated user — one shape.
        await deny("security.sign_in_failure", "denied", email, true);
      }

      // session is non-null here: `deny` never returns, so the guard above
      // always throws when the sign-in failed.
      const session = sessionData.session!;
      const user = session.user;

      if (!(await isAdminUserId(db, user.id))) {
        await deny("security.sign_in_failure", "denied", email, true);
      }

      throttler.clearKey(accountKey);
      throttler.clearKey(sourceKey);
      eventLog(
        request,
        "security.sign_in_success",
        "success",
        user.email ?? email,
      );

      return {
        success: true,
        data: {
          access_token: session.access_token,
          user: {
            id: user.id,
            email: user.email ?? "",
            name: fullNameOf(user),
          },
        },
      };
    },
  );

  app.get("/api/auth/me", async (request) => {
    const token = extractBearerToken(request);
    if (!token) {
      throw unauthorized("Missing bearer token");
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw unauthorized("Invalid or expired token");
    }

    if (!(await isAdminUserId(db, data.user.id))) {
      throw forbidden("User is not an admin");
    }

    return {
      success: true,
      data: {
        id: data.user.id,
        email: data.user.email ?? "",
        name: fullNameOf(data.user),
      },
    };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    // Idempotent by contract: any token state (valid, invalid, missing) → 204.
    const token = extractBearerToken(request);
    let account = "unknown";
    if (token) {
      try {
        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data.user) {
          account = data.user.email ?? data.user.id;
          await supabase.auth.admin.signOut(token, "global");
        }
      } catch {
        // Best-effort revocation — the response is 204 either way.
      }
    }
    eventLog(request, "security.sign_out", "signed_out", account);
    return reply.code(204).send();
  });
}
