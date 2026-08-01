import { buildApp } from "./api/app";
import { loadEnv } from "./config/env";
import { createDb } from "./config/db";
import { createSupabaseAdmin } from "./config/supabase";

const env = loadEnv();

async function main(): Promise<void> {
  const app = buildApp({
    db: createDb(env.DATABASE_URL),
    supabase: createSupabaseAdmin(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  });
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
