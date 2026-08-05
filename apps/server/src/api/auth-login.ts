import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminUsers } from "../db/schema";
import { extractBearerToken } from "./auth";
import type { AppDeps, AppInstance } from "./app";
import { forbidden, unauthorized } from "./errors";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function fullNameOf(user: { user_metadata?: { full_name?: unknown } }): string {
  const value = user.user_metadata?.full_name;
  return typeof value === "string" ? value : "";
}

export async function registerAuth(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db, supabase } = deps;

  app.post(
    "/api/auth/login",
    { schema: { body: loginSchema } },
    async (request) => {
      const { email, password } = request.body;

      const { data: sessionData, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !sessionData.session) {
        throw unauthorized("Invalid email or password");
      }

      const user = sessionData.user;
      const [admin] = await db
        .select({ user_id: adminUsers.user_id })
        .from(adminUsers)
        .where(eq(adminUsers.user_id, user.id))
        .limit(1);
      if (!admin) {
        throw forbidden("User is not an admin");
      }

      return {
        success: true,
        data: {
          access_token: sessionData.session.access_token,
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

    const [admin] = await db
      .select({ user_id: adminUsers.user_id })
      .from(adminUsers)
      .where(eq(adminUsers.user_id, data.user.id))
      .limit(1);
    if (!admin) {
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
}
