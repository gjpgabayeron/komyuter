/**
 * Which fare config the "New route" dialog pre-selects (issue #15).
 *
 * The dialog can be open while the fare-config query is still resolving, and
 * creating a config from the picker invalidates that query — so the selected
 * id is re-derived whenever the list changes. Without the `touched` guard a
 * refetch would silently overwrite whatever the admin had chosen, including a
 * deliberate "No fare config" pick (which is `null`, indistinguishable from
 * "nothing chosen yet").
 */
export interface FareConfigChoice {
  fare_config_id: string;
  is_default: boolean;
}

export interface FareSelectionState {
  /** True once the admin picked something themselves (including "no config"). */
  touched: boolean;
  /** The id currently selected in the form. */
  currentId: string | null;
}

/**
 * Returns the id to select: the admin's own choice when they have made one,
 * otherwise the default configuration (or `null` when none is the default or
 * the list has not loaded).
 */
export function resolveFareSelection(
  configs: readonly FareConfigChoice[] | undefined,
  { touched, currentId }: FareSelectionState,
): string | null {
  if (touched) {
    return currentId;
  }
  return configs?.find((config) => config.is_default)?.fare_config_id ?? null;
}
