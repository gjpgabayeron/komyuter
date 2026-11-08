import type { AppDeps, AppInstance } from "./app";
import { assembleExportDataset } from "../domain/export";

export async function registerExport(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db } = deps;

  app.get(
    "/export/dataset",
    { config: { permission: "EXPORT_DATASET" } },
    async (_request, reply) => {
      const dataset = await assembleExportDataset(db);
      return reply
        .header(
          "Content-Disposition",
          'attachment; filename="komyuter-dataset.json"',
        )
        .header("Content-Type", "application/json")
        .send(dataset);
    },
  );
}
