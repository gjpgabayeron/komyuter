import type { GeocodeHit } from "@komyuter/shared";

/**
 * Compare two place names by what a person means, not by bytes: lowercase,
 * strip accents, drop punctuation, collapse whitespace.
 *
 * `Jaro Plaza` / `jaro  plaza!` / `JARO PLAZA` all fold to `jaro plaza`.
 */
export function normalisePlaceName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Should this answer move the map without being asked?
 *
 * Mapbox's Search Box returns no relevance score, so confidence has to come
 * from the shape of the answer: one hit is unambiguous, and a top hit whose name
 * *is* the query ("Jaro Plaza" → "Jaro Plaza") reads as confirmed. Everything
 * else is a genuine choice, which is the answer the list and the candidate dots
 * exist for.
 */
export function isConfident(query: string, hits: GeocodeHit[]): boolean {
  if (hits.length === 0) return false;
  if (hits.length === 1) return true;
  const wanted = normalisePlaceName(query);
  if (wanted === "") return false;
  return normalisePlaceName(hits[0].name) === wanted;
}
