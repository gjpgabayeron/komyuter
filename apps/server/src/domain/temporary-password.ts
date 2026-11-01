import { randomInt } from "node:crypto";
import { PASSWORD_MIN_LENGTH } from "@komyuter/shared";

/**
 * Letters and digits only, and only the unambiguous ones: a Temporary Password
 * is read off a screen and typed or pasted somewhere else by hand, so the
 * characters a person confuses (`0`/`O`, `1`/`l`/`I`) are left out. 57 symbols
 * over 20 characters is ~117 bits, well inside a handover's lifetime.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Comfortably above the authentication surface's minimum (ADR-0019 §10). */
const TEMPORARY_PASSWORD_LENGTH = Math.max(PASSWORD_MIN_LENGTH, 20);

/**
 * A Temporary Password for an invited or force-reset Account (ADR-0019 §10).
 *
 * The server generates it — there is no client-supplied password — and the
 * value leaves the process exactly once, in the invite response. `randomInt`
 * is the CSPRNG-backed source, so the output is not predictable from earlier
 * passwords, and it is never derived from the email or the Role.
 */
export function generateTemporaryPassword(): string {
  let password = "";
  for (let index = 0; index < TEMPORARY_PASSWORD_LENGTH; index += 1) {
    password += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return password;
}
