import { buildApp } from "./api/app";
import { loadEnv } from "./config/env";
import { createDb } from "./config/db";
import { deploymentProvenance } from "./config/provenance";
import { createSupabaseAdmin } from "./config/supabase";

const env = loadEnv();

async function main(): Promise<void> {
  const app = buildApp({
    db: createDb(env.DATABASE_URL),
    supabase: createSupabaseAdmin(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    env,
  });

  // ADR-0022 §7.3: one line at boot, and deliberately BEFORE `listen`. The
  // deploy whose revision matters most is the one that never becomes healthy,
  // so the provenance has to be in the log ahead of the failure rather than
  // after it. Off the platform this is empty and nothing is logged, so a local
  // start does not carry an empty record.
  const provenance = deploymentProvenance();
  if (Object.keys(provenance).length > 0) {
    app.log.info(provenance, "deployment provenance");
  }

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
