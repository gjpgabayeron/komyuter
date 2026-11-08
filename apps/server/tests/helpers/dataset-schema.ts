import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

/**
 * Validates the export against the checked-in **v1.2 contract fixture**, not the
 * producer's own zod schema. That independence is the point: a contract test
 * that compiled the same schema the server builds the document from would only
 * prove the producer agrees with itself. The frozen `specs/001` JSON document
 * stays untouched as the v1.1 record; this fixture is the current contract.
 */
const contractPath = fileURLToPath(
  new URL("../fixtures/export-dataset.v1.2.schema.json", import.meta.url),
);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(contractPath, "utf8")));

export function validateDatasetAgainstSchema(dataset: unknown): string[] {
  if (validate(dataset)) return [];
  return (validate.errors ?? []).map((error) => {
    const path = error.instancePath.length > 0 ? error.instancePath : "(root)";
    return `${path} ${error.message ?? "is invalid"}`;
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
