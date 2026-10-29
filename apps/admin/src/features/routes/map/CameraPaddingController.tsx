import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import {
  paddingEquals,
  type CameraPadding,
} from "@/features/routes/workspace/geometry";
import {
  REVEAL_DURATION_MS,
  revealEasing,
} from "@/features/routes/workspace/motion";

/** True when the user asked the OS to reduce motion. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface CameraPaddingControllerProps {
  /** The current layout's visible-region padding (ADR-0024). */
  padding: CameraPadding;
}

/**
 * Keeps the map's padding equal to the visible region, so every camera move —
 * `fitBounds`, `flyTo`, `easeTo` from the stop panner — centres inside the
 * area the plates leave uncovered.
 *
 * A layout change is the reveal: opening or closing the context plate moves
 * the visible region's centre by half the newly covered strip. Padding is
 * animated with the plate's own duration and curve and, because MapLibre
 * keeps the location at the padded centre fixed while padding interpolates,
 * that one `easeTo` is also the compensating pan — one motion, not two.
 *
 * Fits set the padding themselves before moving (so their arithmetic is
 * exact); this controller therefore waits for a move in progress to finish,
 * then only converges a padding a fit could not apply.
 */
export function CameraPaddingController({
  padding,
}: CameraPaddingControllerProps) {
  const map = useMap().current;
  const latestRef = useRef(padding);
  latestRef.current = padding;
  const appliedRef = useRef<CameraPadding | null>(null);

  useEffect(() => {
    if (!map) return;

    // The first layout establishes the padding without a visible animation:
    // there is no previous region to travel from.
    if (appliedRef.current === null) {
      appliedRef.current = padding;
      map.setPadding(padding);
      return;
    }

    const apply = () => {
      // A fit calls setPadding itself before computing its camera; never
      // interrupt one mid-flight, or its result would be recomputed against a
      // half-applied frame.
      if (map.isMoving()) return;
      const target = latestRef.current;
      const current = map.getPadding();
      if (
        paddingEquals(
          {
            left: current.left ?? 0,
            top: current.top ?? 0,
            right: current.right ?? 0,
            bottom: current.bottom ?? 0,
          },
          target,
        )
      ) {
        return;
      }
      if (prefersReducedMotion()) {
        map.setPadding(target);
        return;
      }
      map.easeTo({
        padding: target,
        duration: REVEAL_DURATION_MS,
        easing: revealEasing,
      });
    };

    apply();
    // A move that ran while the padding changed (a fit, a drag) settles here;
    // this also re-applies a padding an interrupted ease left behind.
    map.on("moveend", apply);
    return () => {
      map.off("moveend", apply);
    };
  }, [map, padding]);

  return null;
}
