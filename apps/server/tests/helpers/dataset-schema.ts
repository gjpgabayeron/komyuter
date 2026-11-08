import { exportDatasetSchema } from "@komyuter/shared";

/**
 * Validates the export against the **live** contract — the shared zod schema the
 * server assembles the document from — not the frozen `specs/001` JSON document.
 * That file records v1.1 as designed, and the export has moved on (v1.2 carries
 * the full Working Set: direction kind, return-stop identity, notes, AR markers
 * and soft-delete flags). A test pinned to the frozen file would refuse every
 * field added since, which is the opposite of what a contract test is for.
 */
export function validateDatasetAgainstSchema(dataset: unknown): string[] {
  const result = exportDatasetSchema.safeParse(dataset);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path} ${issue.message}`;
  });
}

export function assertDatasetValid(dataset: unknown): void {
  const errors = validateDatasetAgainstSchema(dataset);
  if (errors.length > 0) {
    throw new Error(
      `Export dataset failed schema validation:\n${errors.join("\n")}`,
    );
  }
}
