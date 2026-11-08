import { useEffect } from "react";
import { usePlottingStore } from "@/lib/plottingStore";
import {
  useCreateRestrictionMutation,
  useUpdateRestrictionMutation,
} from "@/features/routes/useRouteQueries";
import { useRestrictionStore } from "./restrictionStore";

/**
 * The universal Save's restriction half. The dedicated rail edits a draft;
 * this validates the two-vertex range and persists it through the existing
 * restriction endpoints. A successful save keeps the editor open on the saved
 * row and clears the dirty flag.
 */
export function useRestrictionSave() {
  const directionId = usePlottingStore((s) => s.directionId);
  const editing = useRestrictionStore((s) => s.editing);
  const dirty = useRestrictionStore((s) => s.dirty);
  const selectedId = useRestrictionStore((s) => s.selectedId);
  const detourId = useRestrictionStore((s) => s.detourId);
  const fromIndex = useRestrictionStore((s) => s.fromIndex);
  const toIndex = useRestrictionStore((s) => s.toIndex);
  const kind = useRestrictionStore((s) => s.kind);
  const note = useRestrictionStore((s) => s.note);
  const isActive = useRestrictionStore((s) => s.isActive);
  const setLastError = useRestrictionStore((s) => s.setLastError);
  const setSaving = useRestrictionStore((s) => s.setSaving);

  const createMutation = useCreateRestrictionMutation(directionId ?? "");
  const updateMutation = useUpdateRestrictionMutation(directionId ?? "");
  const saving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    setSaving(saving);
  }, [saving, setSaving]);

  const saveRestriction = async (): Promise<boolean> => {
    if (!editing || !dirty) return true;
    if (directionId === null) {
      setLastError("Open a direction before saving restrictions.");
      return false;
    }
    if (fromIndex === null || toIndex === null) {
      setLastError("Pick both restriction points on the route.");
      return false;
    }
    if (fromIndex === toIndex) {
      setLastError("Pick two different vertices for the restriction.");
      return false;
    }

    const payload = {
      from_coord_index: fromIndex,
      to_coord_index: toIndex,
      kind,
      detour_id: detourId,
      note: note.trim() === "" ? null : note.trim(),
    };
    setLastError(null);
    try {
      const saved = selectedId
        ? await updateMutation.mutateAsync({
            restrictionId: selectedId,
            patch: { ...payload, is_active: isActive },
          })
        : await createMutation.mutateAsync(payload);
      useRestrictionStore.getState().markSaved(saved);
      return true;
    } catch (error) {
      setLastError(
        error instanceof Error ? error.message : "Restriction save failed.",
      );
      return false;
    }
  };

  return { saveRestriction };
}
