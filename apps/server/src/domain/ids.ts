import { randomUUID } from "node:crypto";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uuidId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function uniqueSlug(base: string, taken: Set<string>): string {
  const seed = slugify(base) || "item";
  // "overview" is a reserved static route segment (GET /routes/overview) — a
  // route slug must never shadow it (perf audit endpoint).
  const reserved = new Set(taken);
  reserved.add("overview");
  let candidate = seed;
  let counter = 2;
  while (reserved.has(candidate)) {
    candidate = `${seed}-${counter}`;
    counter++;
  }
  return candidate;
}
