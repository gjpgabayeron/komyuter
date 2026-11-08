import type { FastifyRequest } from "fastify";

/**
 * Security-event logger (contract: specs/009-auth-quick-wins/contracts/security-events.md).
 * Emits exactly one grep-able pino line per security event on the request
 * logger, so lines correlate with the request audit hook by `reqId`.
 * Denial reasons appear ONLY here — never in HTTP responses (FR-005).
 */

export const SECURITY_EVENTS = [
  "security.sign_in_success",
  "security.sign_in_failure",
  "security.sign_in_throttled",
  "security.sign_out",
] as const;

export type SecurityEvent = (typeof SECURITY_EVENTS)[number];

export type SecurityOutcome = "success" | "denied" | "throttled" | "signed_out";

export function eventLog(
  request: FastifyRequest,
  event: SecurityEvent,
  outcome: SecurityOutcome,
  account: string,
): void {
  request.log.info(
    {
      event,
      account,
      source: request.ip,
      outcome,
    },
    "security event",
  );
}
