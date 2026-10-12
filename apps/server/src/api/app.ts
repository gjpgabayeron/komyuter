import cors from "@fastify/cors";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "@fastify/type-provider-zod";
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Db } from "../config/db";
import type { Env } from "../config/env";
import { ApiError } from "./errors";
import { registerAdminRoutes } from "./index";
import { createOriginGuard } from "./origin-guard";
import { registerSpa, resolveAdminDistDir } from "./spa";

export interface AppDeps {
  db: Db;
  supabase: SupabaseClient;
  env: Env;
}

export type AppInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export function buildApp(deps: AppDeps): AppInstance {
  // `trustProxy: 1` — the deployment puts this process behind the platform's edge
  // proxy, which terminates TLS and forwards to the container, so the socket peer
  // is always the proxy. Without this, `request.ip` is one constant for every
  // client, and the login throttle keys on exactly that value
  // (`api/auth-login.ts`) — so five failed sign-ins from anyone would block
  // sign-in for everyone for the full block window. Exactly one hop is trusted:
  // enough to accept the platform's `X-Forwarded-For`, not enough to trust a
  // chain a client could forge when the origin is reachable directly.
  const app = Fastify({
    logger: true,
    trustProxy: 1,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, { origin: true });

  // US4: origin allowlist, registered right after CORS so preflight is handled
  // first (T026).
  app.addHook("onRequest", createOriginGuard(deps.env.ADMIN_ORIGINS));

  app.addHook("onResponse", async (request, reply) => {
    const adminId = request.adminUserId;
    const logFields: Record<string, unknown> = {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      outcome:
        reply.statusCode >= 400
          ? "failure"
          : reply.statusCode >= 300
            ? "redirect"
            : "success",
    };
    if (adminId) {
      logFields.adminId = adminId;
    }
    app.log.info(logFields, "admin request completed");
  });

  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
      return;
    }
    if (error instanceof Error && "validation" in error) {
      reply.status(422).send({
        success: false,
        error: { code: "VALIDATION_ERROR", message: error.message },
      });
      return;
    }
    app.log.error(error);
    reply.status(500).send({
      success: false,
      error: { code: "INTERNAL", message: "Internal server error" },
    });
  });

  app.register(registerAdminRoutes, deps);

  // ADR-0018 §1: this API also serves the built admin SPA, so production needs
  // one origin and the shipped bundle carries no API hostname. Registered last
  // because its history fallback owns the app-wide 404.
  registerSpa(app, resolveAdminDistDir(deps.env.ADMIN_DIST_DIR));

  return app;
}
