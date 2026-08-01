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
  let candidate = seed;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${seed}-${counter}`;
    counter++;
  }
  return candidate;
}
