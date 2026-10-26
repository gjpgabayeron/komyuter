import { ChevronDown, Plus, X } from "lucide-react";
import { Popup } from "react-map-gl/maplibre";
import type { StopType } from "@komyuter/shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlottingStore } from "@/lib/plottingStore";
import { STOP_TYPE_LABELS } from "@/features/routes/stopLabels";
import { getStopShape } from "@/lib/stopShapes";
import { SHAPE_CLASS } from "./constants";

/** The types behind the split button's caret — the main half covers the waiting
 *  area, which is what most searched places become. */
const OTHER_STOP_TYPES: StopType[] = ["terminal", "major_stop"];

/**
 * Detail popup for a searched place, anchored to its pin.
 *
 * Mounted inside `<Map>` (react-map-gl's `<Popup>` needs the map context), so it
 * tracks pan, zoom and rotation for free instead of being re-projected by hand.
 *
 * The add control is split: the main half adds the place as a **waiting area** —
 * the type most searched places become — and a caret only as wide as its icon
 * opens the other stop types, each item carrying its stop-plate shape and colour.
 * A popup anchored to a pin has little room, so the type choice may not cost a
 * row of its own.
 *
 * `closeOnClick` is off deliberately: the map's own click handler places stops
 * in the Add tool, and a stray click should not also dismiss the details the
 * plotter just opened.
 */
export function PoiPopup() {
  const hit = usePlottingStore((s) => s.poiSelection);
  const selection = usePlottingStore((s) => s.selection);
  const stops = usePlottingStore((s) => s.stops);
  const dismissPoiSelection = usePlottingStore((s) => s.dismissPoiSelection);
  const addPoiAsStop = usePlottingStore((s) => s.addPoiAsStop);

  if (!hit) return null;

  const selectedStopId = selection.type === "stop" ? selection.stopId : null;
  const anchorStopId =
    selectedStopId !== null && stops.some((stop) => stop.id === selectedStopId)
      ? selectedStopId
      : null;

  return (
    <Popup
      longitude={hit.location[0]}
      latitude={hit.location[1]}
      anchor="bottom"
      offset={22}
      closeButton={false}
      closeOnClick={false}
      maxWidth="16rem"
      onClose={() => dismissPoiSelection()}
    >
      <div className="flex w-56 flex-col gap-1.5 p-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-semibold">
              {hit.name}
            </p>
            <p className="text-muted-foreground text-xs leading-snug">
              {hit.description === "" ? "No address given" : hit.description}
            </p>
            <p className="text-muted-foreground text-[11px] tabular-nums">
              {hit.location[0].toFixed(5)}, {hit.location[1].toFixed(5)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss place details"
            onClick={() => dismissPoiSelection()}
            className="text-muted-foreground hover:text-foreground -mt-0.5 -mr-0.5 shrink-0 rounded-sm p-0.5"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Deliberately no hours/phone/website block: this card sits on a pin,
            and the plotter's decision here is "is this the place?" — the add
            button is the action. The wire fields still carry that metadata for
            any surface that wants it later. */}
        {/* Split control: the common placement is one click on the main half;
            the other types sit behind a caret that is only as wide as its icon. */}
        <div className="flex overflow-hidden rounded-sm">
          <button
            type="button"
            onClick={() => addPoiAsStop("waiting_area")}
            className="bg-primary text-primary-foreground flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold"
          >
            <Plus className="size-3.5" aria-hidden />
            Add as Waiting Area
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Add as a different stop type"
              className="bg-primary text-primary-foreground flex shrink-0 items-center justify-center border-l border-white/25 px-1.5 py-1.5"
            >
              <ChevronDown className="size-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {OTHER_STOP_TYPES.map((type) => {
                const shape = getStopShape(type);
                return (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => addPoiAsStop(type)}
                    className="text-xs"
                  >
                    <span
                      aria-hidden
                      className={["size-2", SHAPE_CLASS[shape.shape]].join(" ")}
                      style={{ backgroundColor: shape.color }}
                    />
                    {STOP_TYPE_LABELS[type]}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-muted-foreground text-[11px] leading-tight">
          {anchorStopId === null
            ? "Appends to the end of the stop list."
            : "Inserts after the selected stop."}
        </p>
      </div>
    </Popup>
  );
}
