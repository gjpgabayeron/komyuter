import { Layers, MousePointer2, Plus, Redo2, Undo2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePlottingStore, type BaseMapStyle } from "@/lib/plottingStore";
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
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
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
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-muted-foreground hover:text-foreground data-disabled:pointer-events-none",
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

  const button = (active: boolean) =>
    cn(
      "flex size-7 items-center justify-center rounded-[3px] transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground",
      disabled && "pointer-events-none opacity-40",
    );

  return (
    <div
      role="group"
      aria-label="Edit tool"
      className="bg-muted flex items-center rounded-lg p-0.5"
    >
      <Tooltip>
        <TooltipTrigger
          render={(props) => (
            <button
              {...props}
              type="button"
              aria-label="Select stops"
              aria-pressed={tool === "select"}
              onClick={() => setTool("select")}
              className={button(tool === "select")}
            >
              <MousePointer2 className="size-3.5" />
            </button>
          )}
        />
        <TooltipContent side="top">Select stops (drag to move)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={(props) => (
            <button
              {...props}
              type="button"
              aria-label="Add stops"
              aria-pressed={tool === "add"}
              onClick={() => setTool("add")}
              className={button(tool === "add")}
            >
              <Plus className="size-3.5" />
            </button>
          )}
        />
        <TooltipContent side="top">Add stops (click the map)</TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Centered floating icon-only action bar below the map (FR-019) — Figma-style:
 * each action is a recognizable icon with a tooltip, and the Select/Add tool
 * toggle shows the active edit tool (no separate mode chip — the toggle
 * itself is the indicator). Everything locks while a save is in flight.
 * Persistence lives in the workspace's chrome row (shared `SaveButton`, label
 * "Save changes") — NOT in this bar (FR-014: status text matches the controls
 * that exist).
 */
export function PlotActionBar({ onUndo, onRedo }: PlotActionBarProps) {
  const saving = usePlottingStore((s) => s.saving);
  const history = usePlottingStore((s) => s.history);

  const undoReady = canUndo(history) && !saving;
  const redoReady = canRedo(history) && !saving;

  return (
    <TooltipProvider>
      <Plate className="flex items-center gap-0.5 px-1.5 py-1">
        <ToolToggle disabled={saving} />

        <Separator orientation="vertical" className="mx-1 h-5" />

        <IconAction label="Undo" onClick={onUndo} disabled={!undoReady}>
          <Undo2 className="size-3.5" />
        </IconAction>
        <IconAction label="Redo" onClick={onRedo} disabled={!redoReady}>
          <Redo2 className="size-3.5" />
        </IconAction>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <LayerToggles />
      </Plate>
    </TooltipProvider>
  );
}
