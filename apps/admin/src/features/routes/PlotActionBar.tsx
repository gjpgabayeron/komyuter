import {
  Ban,
  Layers,
  MousePointer2,
  Plus,
  Redo2,
  Route,
  Undo2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePlottingStore, type BaseMapStyle } from "@/lib/plottingStore";
import { useRestrictionStore } from "@/features/restrictions/restrictionStore";
import { useDetourStore } from "@/features/detours/detourStore";
import { canRedo, canUndo } from "@/lib/plottingHistory";
import { cn } from "@/lib/utils";
import { Plate } from "@/components/shared/Plate";
import { STOP_TYPE_LABELS } from "@/features/routes/stopLabels";
import type { StopType } from "@komyuter/shared";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PlotActionBarProps {
  onUndo: () => void;
  onRedo: () => void;
}

function IconAction({
  label,
  onClick,
  disabled,
  selected,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-pressed={selected}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-muted-foreground hover:text-foreground data-disabled:pointer-events-none",
              selected && "bg-primary/10 text-primary hover:bg-primary/15",
            )}
          >
            {children}
          </button>
        )}
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarDivider() {
  return (
    <span
      aria-hidden="true"
      className="bg-border mx-1.5 h-5 w-px shrink-0 self-center"
    />
  );
}

/** Map layer controls (FR-016 product revision) — one collapsible Layers
 *  submenu in the toolbar:
 *  - Basemap: style (Default / Minimalist / 3D) + opacity
 *  - Markers: a per-stop-type group — every type is on by default and can be
 *    hidden individually (no surprise sub-filtering)
 *  - Routes: the path lines
 *  Toggling one control leaves the others untouched (setLayers merges). */
function LayerToggles() {
  const layers = usePlottingStore((s) => s.layers);
  const setLayers = usePlottingStore((s) => s.setLayers);
  const stopTypes = Object.keys(STOP_TYPE_LABELS) as StopType[];
  const styles: { value: BaseMapStyle; label: string }[] = [
    { value: "default", label: "Default" },
    { value: "minimalist", label: "Minimalist" },
    { value: "3d", label: "3D" },
  ];
  return (
    <Tooltip>
      <TooltipTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={(props) => (
              <button
                {...props}
                type="button"
                aria-label="Layers"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon-sm" }),
                  "text-muted-foreground hover:text-foreground",
                )}
              >
                <Layers className="size-3.5" />
              </button>
            )}
          />
          <DropdownMenuContent side="top" align="start" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Map Layers</DropdownMenuLabel>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Basemap</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Basemap Styles</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={layers.baseStyle}
                        onValueChange={(value) =>
                          setLayers({ baseStyle: value as BaseMapStyle })
                        }
                      >
                        {styles.map((style) => (
                          <DropdownMenuRadioItem
                            key={style.value}
                            value={style.value}
                          >
                            {style.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <div className="px-1.5 py-1">
                      <label
                        htmlFor="basemap-opacity"
                        className="text-muted-foreground flex items-center justify-between text-xs"
                      >
                        <span>Opacity</span>
                        <span className="tabular-nums">
                          {Math.round(layers.baseOpacity * 100)}%
                        </span>
                      </label>
                      <input
                        id="basemap-opacity"
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(layers.baseOpacity * 100)}
                        onChange={(event) =>
                          setLayers({
                            baseOpacity: Number(event.target.value) / 100,
                          })
                        }
                        className="w-full"
                        aria-label="Basemap opacity"
                      />
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Markers</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Toggle Visibility</DropdownMenuLabel>
                      {stopTypes.map((type) => (
                        <DropdownMenuCheckboxItem
                          key={type}
                          checked={layers.markers[type]}
                          onCheckedChange={(value) =>
                            setLayers({
                              markers: { ...layers.markers, [type]: value },
                            })
                          }
                        >
                          {STOP_TYPE_LABELS[type]}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuCheckboxItem
                        checked={layers.detourStops}
                        onCheckedChange={(value) =>
                          setLayers({ detourStops: value })
                        }
                      >
                        Detour Stop Markers
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={layers.detourNodes}
                        onCheckedChange={(value) =>
                          setLayers({ detourNodes: value })
                        }
                      >
                        Split/Merge Indicators
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Toggle Labels</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={layers.markerLabels}
                        onCheckedChange={(value) =>
                          setLayers({ markerLabels: value })
                        }
                      >
                        Stop Names
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={layers.detourStopLabels}
                        onCheckedChange={(value) =>
                          setLayers({ detourStopLabels: value })
                        }
                      >
                        Detour Stop Names
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Polylines</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Toggle Visibility</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={layers.routes}
                        onCheckedChange={(value) =>
                          setLayers({ routes: value })
                        }
                      >
                        Main Route
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={layers.detours}
                        onCheckedChange={(value) =>
                          setLayers({ detours: value })
                        }
                      >
                        Alternative Routes
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipTrigger>
      <TooltipContent side="top">Modify Map Layers</TooltipContent>
    </Tooltip>
  );
}

/** Edit-mode pointer tool: Select (click/drag stops) vs Add (click to insert)
 *  vs Detour (click to plot an alternative route) — one three-way toggle so
 *  the detour workflow feels exactly like base-route plotting. */
function ToolToggle({ disabled }: { disabled: boolean }) {
  const tool = usePlottingStore((s) => s.tool);
  const setTool = usePlottingStore((s) => s.setTool);
  const restrictionEditing = useRestrictionStore((s) => s.editing);
  const startNew = useRestrictionStore((s) => s.startNew);

  const selectLabel = restrictionEditing
    ? "Select restriction"
    : "Select stops";
  const addLabel = restrictionEditing ? "Add restriction" : "Add stops";

  return (
    <div
      role="group"
      aria-label={restrictionEditing ? "Restriction tool" : "Edit tool"}
      className="flex items-center gap-0.5"
    >
      <IconAction
        label={selectLabel}
        onClick={() => setTool("select")}
        disabled={disabled}
        selected={tool === "select"}
      >
        <MousePointer2 className="size-3.5" />
      </IconAction>
      <IconAction
        label={addLabel}
        onClick={() => {
          setTool("add");
          if (restrictionEditing) startNew();
        }}
        disabled={disabled}
        selected={tool === "add"}
      >
        <Plus className="size-3.5" />
      </IconAction>
    </div>
  );
}

function EditorModeToggle() {
  const editing = useRestrictionStore((s) => s.editing);
  const enter = useRestrictionStore((s) => s.enter);
  const exit = useRestrictionStore((s) => s.exit);
  const saving = usePlottingStore((s) => s.saving);
  const restrictionSaving = useRestrictionStore((s) => s.saving);
  const detourOpen = useDetourStore((s) => s.open);
  const editDetourId = useDetourStore((s) => s.editDetourId);
  const modeLocked = saving || restrictionSaving;
  const restrictionBlocked = !editing && detourOpen && editDetourId === null;

  const modeButton = cn(
    "flex size-7 items-center justify-center rounded-[3px] transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-40",
  );

  return (
    <div
      role="group"
      aria-label="Editor mode"
      className="bg-muted flex items-center rounded-lg p-0.5"
    >
      <Tooltip>
        <TooltipTrigger
          render={(props) => (
            <button
              {...props}
              type="button"
              aria-label="Plot mode"
              aria-pressed={!editing}
              disabled={modeLocked}
              onClick={() => {
                if (editing) {
                  usePlottingStore.getState().setTool("select");
                  exit();
                }
              }}
              className={cn(
                modeButton,
                !editing
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Route className="size-3.5" />
            </button>
          )}
        />
        <TooltipContent side="top">Plot mode</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={(props) => (
            <button
              {...props}
              type="button"
              aria-label="Restrictions mode"
              aria-pressed={editing}
              disabled={modeLocked || restrictionBlocked}
              onClick={() => {
                if (!editing) {
                  usePlottingStore.getState().setTool("select");
                  enter(detourOpen ? editDetourId : null);
                }
              }}
              className={cn(
                modeButton,
                editing
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Ban className="size-3.5" />
            </button>
          )}
        />
        <TooltipContent side="top">Restrictions mode</TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Centered floating icon-only action bar below the map (FR-019) — Figma-style:
 * each action is a recognizable icon with a tooltip; the Select/Add tool toggle
 * shows the active edit tool, and the Plot/Restrictions segmented switch owns
 * the editor mode. Everything locks while a save is in flight; the dedicated
 * Save button (right of the bar) owns persistence.
 */
export function PlotActionBar({ onUndo, onRedo }: PlotActionBarProps) {
  const saving = usePlottingStore((s) => s.saving);
  const history = usePlottingStore((s) => s.history);
  const restrictionEditing = useRestrictionStore((s) => s.editing);
  const restrictionSaving = useRestrictionStore((s) => s.saving);

  const undoReady = canUndo(history) && !saving && !restrictionEditing;
  const redoReady = canRedo(history) && !saving && !restrictionEditing;

  return (
    <TooltipProvider>
      <Plate className="flex items-center gap-0.5 rounded-[4px] px-1.5 py-1">
        <ToolToggle disabled={saving || restrictionSaving} />

        <ToolbarDivider />

        <IconAction label="Undo" onClick={onUndo} disabled={!undoReady}>
          <Undo2 className="size-3.5" />
        </IconAction>
        <IconAction label="Redo" onClick={onRedo} disabled={!redoReady}>
          <Redo2 className="size-3.5" />
        </IconAction>

        <ToolbarDivider />

        <EditorModeToggle />

        <ToolbarDivider />

        <LayerToggles />
      </Plate>
    </TooltipProvider>
  );
}
