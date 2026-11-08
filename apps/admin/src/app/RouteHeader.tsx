import { useMemo, useState, type ReactNode } from "react";
import {
  Check,
  GitBranch,
  MoreHorizontal,
  Plus,
  Route as RouteIcon,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { filterDetours, filterRoutes } from "@/lib/headerSearch";
import { usePlottingStore } from "@/lib/plottingStore";
import { clearSelection } from "@/lib/selection";
import { getWorkspaceBridge } from "@/lib/workspaceBridge";
import { useWorkspaceAccess } from "@/features/auth/useCapabilities";
import { buildDetourTarget } from "@/features/detours/target";
import { useDetourStore } from "@/features/detours/detourStore";
import {
  useDeleteDetourMutation,
  useDetoursQuery,
  useDirectionStopsQuery,
  useDirectionsQuery,
  useRouteQuery,
  useRoutesQuery,
  useUpdateDetourMutation,
} from "@/features/routes/useRouteQueries";
import type { DetourEntity } from "@/features/routes/routesApi";
import { HeaderPopover } from "./HeaderPopover";

type PendingAction =
  | { kind: "main" }
  | { kind: "open"; detour: DetourEntity }
  | { kind: "new" }
  | { kind: "delete"; detour: DetourEntity }
  | null;

function Chip({ children }: { children: ReactNode }) {
  return <span className="min-w-0 truncate text-sm">{children}</span>;
}

function Slash() {
  return (
    <span aria-hidden className="text-muted-foreground/40 shrink-0 select-none">
      /
    </span>
  );
}

/** Route and branch chips for the `/routes` section. */
export function RouteHeader() {
  const routeId = usePlottingStore((s) => s.routeId);
  const focusedRouteId = usePlottingStore((s) => s.focusedRouteId);
  const displayRouteId = routeId ?? focusedRouteId;
  const routeQuery = useRouteQuery(displayRouteId);
  const { readOnly } = useWorkspaceAccess();

  if (displayRouteId === null) return null;

  const routeName = routeQuery.data?.name;
  const loading = routeQuery.isPending;
  const editing = routeId !== null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Slash />
      <RouteSwitcher
        currentName={routeName}
        currentRouteId={displayRouteId}
        loading={loading}
        errored={routeQuery.isError}
        readOnly={readOnly}
        onRetry={() => void routeQuery.refetch()}
      />
      {editing ? (
        <>
          <Slash />
          <BranchSwitcher
            routeName={routeName ?? "Route"}
            readOnly={readOnly}
          />
        </>
      ) : null}
    </div>
  );
}

function RouteSwitcher({
  currentName,
  currentRouteId,
  loading,
  errored,
  readOnly,
  onRetry,
}: {
  currentName: string | undefined;
  currentRouteId: string;
  loading: boolean;
  errored: boolean;
  readOnly: boolean;
  onRetry: () => void;
}) {
  const routesQuery = useRoutesQuery();
  const [query, setQuery] = useState("");
  const routes = useMemo(
    () => filterRoutes(routesQuery.data ?? [], query),
    [routesQuery.data, query],
  );
  const bridge = getWorkspaceBridge();

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading route"
        className="flex h-8 items-center gap-1.5 px-2"
      >
        <RouteIcon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="bg-muted block h-3 w-24 animate-pulse rounded-sm motion-reduce:animate-none" />
      </div>
    );
  }

  if (errored) {
    return (
      <div className="flex h-8 items-center gap-2 px-2 text-xs">
        <span className="text-destructive">Route unavailable</span>
        <button
          type="button"
          onClick={onRetry}
          className="text-muted-foreground hover:text-foreground text-xs underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <HeaderPopover
      label="Switch route"
      trigger={
        <>
          <RouteIcon className="text-muted-foreground size-3.5 shrink-0" />
          <Chip>{currentName ?? "Route"}</Chip>
        </>
      }
    >
      {(close) => (
        <div>
          <div className="p-1.5">
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a route…"
              className="h-8 text-xs"
            />
          </div>
          <div className="overlay-scrollbar max-h-72 overflow-y-auto px-1 pb-1">
            {routesQuery.isLoading ? (
              <p className="text-muted-foreground px-2 py-3 text-xs">
                Loading routes…
              </p>
            ) : null}
            {!routesQuery.isLoading && routes.length === 0 ? (
              <p className="text-muted-foreground px-2 py-3 text-xs">
                No routes match.
              </p>
            ) : null}
            {routes.map((route) => (
              <button
                key={route.route_id}
                type="button"
                onClick={() => {
                  bridge?.switchRoute(route.route_id);
                  close();
                }}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {route.name}
                  </span>
                  <span className="text-muted-foreground block text-[11px]">
                    {route.short_name}
                  </span>
                </span>
                {!route.is_active ? (
                  <Badge
                    variant="outline"
                    className="h-4 px-1 text-[10px] font-medium"
                  >
                    Inactive
                  </Badge>
                ) : null}
                {route.route_id === currentRouteId ? (
                  <Check className="text-primary size-3.5 shrink-0" />
                ) : null}
              </button>
            ))}
          </div>
          <div className="border-t p-1">
            {!readOnly ? (
              <button
                type="button"
                onClick={() => {
                  bridge?.openNewRoute();
                  close();
                }}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs"
              >
                <Plus className="size-3.5" /> New route
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                bridge?.goOverview();
                close();
              }}
              className="hover:bg-muted text-muted-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs"
            >
              View all routes
            </button>
          </div>
        </div>
      )}
    </HeaderPopover>
  );
}

function BranchSwitcher({
  routeName,
  readOnly,
}: {
  routeName: string;
  readOnly: boolean;
}) {
  const routeId = usePlottingStore((s) => s.routeId);
  const directionId = usePlottingStore((s) => s.directionId);
  const open = useDetourStore((s) => s.open);
  const touched = useDetourStore((s) => s.touched);
  const editBaseline = useDetourStore((s) => s.editBaseline);
  const detoursQuery = useDetoursQuery(directionId);
  const directionsQuery = useDirectionsQuery(routeId);
  const stopsQuery = useDirectionStopsQuery(directionId);
  const deleteMutation = useDeleteDetourMutation(directionId ?? "");
  const updateMutation = useUpdateDetourMutation(directionId ?? "");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);

  const direction =
    directionsQuery.data?.find((d) => d.direction_id === directionId) ?? null;
  const detours = useMemo(() => detoursQuery.data ?? [], [detoursQuery.data]);
  const filtered = useMemo(
    () => filterDetours(detours, query),
    [detours, query],
  );
  const stops = stopsQuery.data ?? [];
  const currentLabel = open ? (editBaseline?.label ?? "Detour") : "Main";

  const execute = (action: Exclude<PendingAction, null>) => {
    if (!direction) return;
    switch (action.kind) {
      case "main":
        useDetourStore.getState().close();
        break;
      case "open":
        usePlottingStore.getState().setSelection(clearSelection);
        useDetourStore.getState().openEdit(
          action.detour,
          buildDetourTarget(
            direction,
            routeName,
            detours.length,
            stops.map((stop) => ({
              stop_id: stop.stop_id,
              name: stop.name,
              location: stop.location.coordinates,
            })),
          ),
        );
        break;
      case "new":
        usePlottingStore.getState().setSelection(clearSelection);
        useDetourStore.getState().openNew(
          buildDetourTarget(
            direction,
            routeName,
            detours.length,
            stops.map((stop) => ({
              stop_id: stop.stop_id,
              name: stop.name,
              location: stop.location.coordinates,
            })),
          ),
        );
        break;
      case "delete":
        void deleteMutation
          .mutateAsync(action.detour.detour_id)
          .then(() => {
            if (editBaseline?.detour_id === action.detour.detour_id) {
              useDetourStore.getState().close();
            }
          })
          .catch(() => {
            // Toast handled by the mutation.
          });
        break;
    }
    setPending(null);
  };

  const request = (action: Exclude<PendingAction, null>) => {
    if (action.kind !== "delete" && open && touched) {
      setPending(action);
      return;
    }
    execute(action);
  };

  return (
    <>
      <HeaderPopover
        label="Switch alternative route"
        trigger={
          <>
            <GitBranch className="text-muted-foreground size-3.5 shrink-0" />
            <Chip>{currentLabel}</Chip>
            {open && touched ? (
              <span
                aria-label="Unsaved alternative-route changes"
                className="bg-warning size-1.5 shrink-0 rounded-full"
              />
            ) : null}
          </>
        }
      >
        {(close) => (
          <div>
            <div className="p-1.5">
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find alternative route…"
                className="h-8 text-xs"
              />
            </div>
            <div className="overlay-scrollbar max-h-72 overflow-y-auto px-1 pb-1">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  request({ kind: "main" });
                  close();
                }}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left disabled:opacity-60"
              >
                <span className="min-w-0 flex-1 text-xs font-medium">Main</span>
                {!open ? (
                  <Check className="text-primary size-3.5 shrink-0" />
                ) : null}
              </button>
              {detoursQuery.isLoading ? (
                <p className="text-muted-foreground px-2 py-3 text-xs">
                  Loading alternative routes…
                </p>
              ) : null}
              {!detoursQuery.isLoading && filtered.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-xs">
                  {detours.length === 0
                    ? "No alternative routes yet."
                    : "No alternative routes match."}
                </p>
              ) : null}
              {filtered.map((detour) => (
                <div
                  key={detour.detour_id}
                  className="hover:bg-muted flex items-center gap-1 rounded-sm"
                >
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      request({ kind: "open", detour });
                      close();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-xs font-medium",
                          !detour.is_active && "text-muted-foreground",
                        )}
                      >
                        {detour.label}
                      </span>
                      <span className="text-muted-foreground block text-[11px]">
                        {detour.detour_stops.length} stop
                        {detour.detour_stops.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    {!detour.is_active ? (
                      <Badge
                        variant="outline"
                        className="h-4 px-1 text-[10px] font-medium"
                      >
                        Inactive
                      </Badge>
                    ) : null}
                    {editBaseline?.detour_id === detour.detour_id ? (
                      <Check className="text-primary size-3.5 shrink-0" />
                    ) : null}
                  </button>
                  {!readOnly ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={(props) => (
                          <button
                            {...props}
                            type="button"
                            aria-label={`Manage ${detour.label}`}
                            className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-sm"
                          >
                            <MoreHorizontal className="size-3.5" />
                          </button>
                        )}
                      />
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => {
                            request({ kind: "open", detour });
                            close();
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            void updateMutation.mutateAsync({
                              detourId: detour.detour_id,
                              patch: { is_active: !detour.is_active },
                            })
                          }
                        >
                          {detour.is_active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setPending({ kind: "delete", detour })}
                        >
                          Delete permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              ))}
            </div>
            {!readOnly ? (
              <div className="border-t p-1">
                <button
                  type="button"
                  disabled={!direction}
                  onClick={() => {
                    request({ kind: "new" });
                    close();
                  }}
                  className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs disabled:opacity-60"
                >
                  <Plus className="size-3.5" /> Add alternative route
                </button>
              </div>
            ) : null}
          </div>
        )}
      </HeaderPopover>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "delete"
                ? `Delete alternative route "${pending.detour.label}"?`
                : "Discard unsaved alternative-route changes?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "delete"
                ? "This permanently deletes the detour. Its label becomes available for reuse."
                : "The current alternative route has unsaved changes. Your draft is kept; you can restore it when you return."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pending) execute(pending);
              }}
            >
              {pending?.kind === "delete"
                ? "Delete permanently"
                : "Switch and keep draft"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
