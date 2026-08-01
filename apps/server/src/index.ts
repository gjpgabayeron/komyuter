import { buildApp } from "./api/app";
import { loadEnv } from "./config/env";

const env = loadEnv();

async function main(): Promise<void> {
  const app = buildApp();
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
