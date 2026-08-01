import { z } from "zod";
import { ERROR_CODES } from "../types/envelope";

export const errorCodeSchema = z.enum(ERROR_CODES);

export const errorBodySchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
});

export const successEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({ success: z.literal(true), data: dataSchema });

export const failureEnvelopeSchema = z.object({
  success: z.literal(false),
  error: errorBodySchema,
});

export const envelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([successEnvelopeSchema(dataSchema), failureEnvelopeSchema]);
