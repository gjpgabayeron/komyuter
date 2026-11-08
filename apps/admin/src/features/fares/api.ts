import type { z } from "zod";
import {
  createFareConfigSchema,
  updateFareConfigSchema,
  type FareConfiguration,
} from "@komyuter/shared";
import { api } from "@/lib/api";

export type CreateFareConfigPayload = z.infer<typeof createFareConfigSchema>;
export type UpdateFareConfigPayload = z.infer<typeof updateFareConfigSchema>;

/** List-item shape returned by `GET /api/admin/fare-configs`. */
export interface FareConfigListItem extends FareConfiguration {
  is_active: boolean;
  active_route_count: number;
}

/** Detail shape returned by create/update endpoints (no reference count). */
export type FareConfigDetail = FareConfiguration & { is_active: boolean };

export async function listFareConfigs(): Promise<FareConfigListItem[]> {
  const { data } = await api.get<FareConfigListItem[]>(
    "/api/admin/fare-configs",
  );
  return data;
}

export async function createFareConfig(
  payload: CreateFareConfigPayload,
): Promise<FareConfigDetail> {
  const { data } = await api.post<FareConfigDetail>(
    "/api/admin/fare-configs",
    payload,
  );
  return data;
}

export async function updateFareConfig(
  fareConfigId: string,
  patch: UpdateFareConfigPayload,
): Promise<FareConfigDetail> {
  const { data } = await api.put<FareConfigDetail>(
    `/api/admin/fare-configs/${fareConfigId}`,
    patch,
  );
  return data;
}

export async function deactivateFareConfig(
  fareConfigId: string,
): Promise<{ fare_config_id: string; is_active: boolean }> {
  const { data } = await api.delete<{
    fare_config_id: string;
    is_active: boolean;
  }>(`/api/admin/fare-configs/${fareConfigId}`);
  return data;
}
