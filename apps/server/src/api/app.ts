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
import { ApiError } from "./errors";
import { registerAdminRoutes } from "./index";

export interface AppDeps {
  db: Db;
  supabase: SupabaseClient;
}

export type AppInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export function buildApp(deps: AppDeps): AppInstance {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, { origin: true });

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

  return app;
}
