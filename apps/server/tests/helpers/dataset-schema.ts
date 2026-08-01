import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(
  currentDir,
  "../../../../specs/001-local-supabase-backend/contracts/export-dataset.schema.json",
);

let cachedValidate: ReturnType<Ajv["compile"]> | undefined;

export function validateDatasetAgainstSchema(dataset: unknown): string[] {
  if (!cachedValidate) {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    cachedValidate = ajv.compile(schema);
  }
  cachedValidate(dataset);
  return (
    cachedValidate.errors?.map((e) => `${e.instancePath} ${e.message}`) ?? []
  );
}

export function assertDatasetValid(dataset: unknown): void {
  const errors = validateDatasetAgainstSchema(dataset);
  if (errors.length > 0) {
    throw new Error(
      `Export dataset failed schema validation:\n${errors.join("\n")}`,
    );
  }
}
