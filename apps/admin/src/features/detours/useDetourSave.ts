import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UpdateDetourPayload } from "@/features/routes/routesApi";
import {
  useCreateDetourMutation,
  useDetoursQuery,
  useUpdateDetourMutation,
} from "@/features/routes/useRouteQueries";
import { useAuth } from "@/features/auth/auth";
import { clearDetourDraft, clearDetourDraftFor } from "@/lib/draft";
import { routeKeys } from "@/lib/queryKeys";
import { useDetourStore } from "./detourStore";

const CONFLICT_COPY =
  "Another detour was added or removed while you were editing — review the list and save again.";

/**
 * The universal save's detour half. The right rail no longer owns a Save
 * button; the workspace Save calls this after validating the same draft the
 * panel edits. A successful save closes the detour and clears its draft.
 */
export function useDetourSave() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const target = useDetourStore((s) => s.target);
  const open = useDetourStore((s) => s.open);
  const touched = useDetourStore((s) => s.touched);
  const editDetourId = useDetourStore((s) => s.editDetourId);
  const editBaseline = useDetourStore((s) => s.editBaseline);
  const baselineDetourCount = useDetourStore((s) => s.baselineDetourCount);
  const isActive = useDetourStore((s) => s.isActive);
  const validateSave = useDetourStore((s) => s.validateSave);
  const setLastError = useDetourStore((s) => s.setLastError);

  const directionId = target?.directionId ?? null;
  const detoursQuery = useDetoursQuery(directionId);
  const createMutation = useCreateDetourMutation(directionId ?? "");
  const updateMutation = useUpdateDetourMutation(directionId ?? "");
  const queryClient = useQueryClient();
  const saving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    useDetourStore.getState().setSaving(saving);
  }, [saving]);

  const closeAfterSave = () => {
    const direction = target?.directionId;
    const detourId = editDetourId;
    useDetourStore.getState().close();
    if (!direction || !userId) return;
    if (detourId) clearDetourDraftFor(userId, direction, detourId);
    else clearDetourDraft(userId, direction);
  };

  const buildEditPatch = (
    baseline: NonNullable<typeof editBaseline>,
  ): UpdateDetourPayload | null => {
    const result = validateSave();
    if (!result.ok) {
      setLastError(result.reason);
      return null;
    }
    const payload = result.payload;
    const patch: UpdateDetourPayload = {};
    if (payload.label !== baseline.label) patch.label = payload.label;
    if (payload.commuter_instruction !== baseline.commuter_instruction) {
      patch.commuter_instruction = payload.commuter_instruction;
    }
    if ((payload.driver_instruction ?? null) !== baseline.driver_instruction) {
      patch.driver_instruction = payload.driver_instruction ?? null;
    }
    const loopChanged =
      JSON.stringify(payload.detour_polyline.coordinates) !==
      JSON.stringify(baseline.detour_polyline.coordinates);
    const entryChanged =
      JSON.stringify(payload.entry.coordinates) !==
      JSON.stringify(baseline.entry.coordinates);
    const exitChanged =
      JSON.stringify(payload.exit.coordinates) !==
      JSON.stringify(baseline.exit.coordinates);
    if (loopChanged || entryChanged || exitChanged) {
      patch.detour_polyline = payload.detour_polyline;
      patch.entry = payload.entry;
      patch.exit = payload.exit;
      patch.additional_distance_meters = payload.additional_distance_meters;
    }
    const stopsChanged =
      JSON.stringify(payload.detour_stops) !==
      JSON.stringify(
        baseline.detour_stops.map(
          ({
            name,
            location,
            type,
            is_guaranteed_service,
            landmark_hint,
            notes,
          }) => ({
            name,
            location,
            type,
            is_guaranteed_service,
            landmark_hint,
            notes,
          }),
        ),
      );
    if (stopsChanged) patch.detour_stops = payload.detour_stops;
    if (isActive !== baseline.is_active) patch.is_active = isActive;
    return Object.keys(patch).length > 0 ? patch : null;
  };

  const saveDetour = async (): Promise<boolean> => {
    if (!open || !target || !touched) return true;

    if (editDetourId && editBaseline) {
      const patch = buildEditPatch(editBaseline);
      // A touched draft that validates back to the baseline is already saved;
      // do not block the route half of the universal save.
      if (!patch) return true;
      try {
        await updateMutation.mutateAsync({ detourId: editDetourId, patch });
        await queryClient.invalidateQueries({
          queryKey: routeKeys.detours(target.directionId),
        });
        closeAfterSave();
        return true;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Save failed.");
        return false;
      }
    }

    const savedCount = detoursQuery.data?.length ?? 0;
    if (savedCount !== baselineDetourCount) {
      void detoursQuery.refetch();
      setLastError(CONFLICT_COPY);
      return false;
    }
    const result = validateSave();
    if (!result.ok) {
      setLastError(result.reason);
      return false;
    }
    try {
      await createMutation.mutateAsync(result.payload);
      await queryClient.invalidateQueries({
        queryKey: routeKeys.detours(target.directionId),
      });
      closeAfterSave();
      return true;
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Save failed.");
      return false;
    }
  };

  return { saveDetour };
}
