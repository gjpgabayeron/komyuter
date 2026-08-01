import cors from "@fastify/cors";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "@fastify/type-provider-zod";
import Fastify, { type FastifyInstance } from "fastify";
import { ApiError } from "./errors";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, { origin: true });

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

  return app;
}
