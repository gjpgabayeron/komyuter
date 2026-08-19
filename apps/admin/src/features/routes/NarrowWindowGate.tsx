import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Expand } from "lucide-react";
import {
  computeMapWidth,
  isMapGateActive,
  type WorkspaceMode,
} from "./workspace/geometry";

interface NarrowWindowGateProps {
  /** Current mode; the gate keys off its free-map-region footprint. */
  mode: WorkspaceMode;
  children: ReactNode;
}

/**
 * The wider-window gate (REFACTOR.md / plan.md, ADR-0015 layering): a
 * full-window plate that covers the workspace whenever the free map region
 * between the floating plates would fall below 400 px — below the 1024 px
 * floor, or when the expanded shell rail steals the width. The workspace
 * (including the full-bleed map) stays mounted UNDER the plate — the map
 * keeps its identity and camera across gate toggles; the plate simply covers
 * everything and makes the covered chrome inert.
 */
export function NarrowWindowGate({ mode, children }: NarrowWindowGateProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Set via the DOM property (not the React prop) — React 18 warns on the
  // inert attribute, and this keeps the covered chrome unfocusable.
  const innerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [belowFloor, setBelowFloor] = useState(false);

  // Measure this wrapper (the workspace width, right of the shell rail) and
  // recompute the free map region from the formula (contract §3). Initial
  // paint honors the first measured width — no gate flash.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setBelowFloor(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Before the first measurement (width 0) render children — the gate never
  // flashes on initial paint.
  const mapWidth = width > 0 ? computeMapWidth(width, 0, mode) : null;
  const blocked =
    belowFloor || (mapWidth !== null && isMapGateActive(mapWidth));

  // When the gate is up, the covered workspace chrome is made inert
  // (unfocusable) while the plate covers it — layout-effect so the gap
  // between the plate appearing and the covered chrome losing focus never
  // exists on the same frame.
  useLayoutEffect(() => {
    if (innerRef.current) innerRef.current.inert = blocked;
  }, [blocked]);

  return (
    <div ref={ref} className="relative h-full w-full">
      <div ref={innerRef} className="h-full w-full">
        {children}
      </div>
      {blocked && (
        <div className="bg-background absolute inset-0 z-50">
          <section
            role="status"
            aria-live="polite"
            className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center"
          >
            <div className="flex flex-col items-center gap-2">
              <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-lg">
                <Expand className="size-5" aria-hidden="true" />
              </span>
              <h1 className="font-display text-foreground text-lg font-semibold">
                A wider window is needed
              </h1>
            </div>
            <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
              The route workspace keeps the map and its panels from colliding by
              reserving fixed plates — below 400&nbsp;px of free map width they
              no longer fit. Widen your browser window, or collapse the
              navigation rail, to continue.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
