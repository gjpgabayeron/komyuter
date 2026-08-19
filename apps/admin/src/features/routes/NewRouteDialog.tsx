import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usePlottingStore } from "@/lib/plottingStore";
import { FareConfigSelect } from "./FareConfigSelect";
import { isValidHexColor, randomRouteColor } from "./routeColors";
import { useCreateRouteMutation } from "./useRouteQueries";
import { useFareConfigsQuery } from "@/features/fares/queries";

interface NewRouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const randomColor = () => randomRouteColor();

/** Minimal create-route form (FR-002/FR-030): name, short name, colour, fare. */
export function NewRouteDialog({ open, onOpenChange }: NewRouteDialogProps) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [color, setColor] = useState<string>(randomColor);
  const [hexText, setHexText] = useState(color);
  const [fareConfigId, setFareConfigId] = useState<string | null>(null);

  // A fresh random colour on EVERY open — not just first mount — so each new
  // route gets a distinct identity even if the dialog stays mounted between
  // opens (or the previous create was cancelled). Also pre-fills the default
  // fare config when one exists.
  const fareQuery = useFareConfigsQuery();
  useEffect(() => {
    if (!open) return;
    const next = randomColor();
    setColor(next);
    setHexText(next);
    const defaults = fareQuery.data?.filter((c) => c.is_default);
    setFareConfigId(defaults?.[0]?.fare_config_id ?? null);
  }, [open, fareQuery.data]);

  const createMutation = useCreateRouteMutation();
  // Route creation is blocked entirely until at least one fare config exists.
  const noFareConfigs =
    !fareQuery.isLoading && (fareQuery.data?.length ?? 0) === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !shortName.trim()) return;
    if (noFareConfigs) {
      toast.error(
        "No fare config exists yet — create one in Fares first, then add the route.",
      );
      return;
    }
    try {
      const route = await createMutation.mutateAsync({
        name: name.trim(),
        short_name: shortName.trim(),
        color,
        fare_config_id: fareConfigId ?? undefined,
        // Draft-first workflow: new routes start inactive for review (Pasted #42).
        is_active: false,
      });
      // Select the new route as the active plotting surface (FR-002) and put
      // stop-adding immediately active (US2: "Creating lifts the veil, mounts
      // the editing chrome, and puts stop-adding immediately active").
      usePlottingStore.getState().openRoute(route.route_id);
      usePlottingStore.getState().setTool("add");
      onOpenChange(false);
      setName("");
      setShortName("");
      const next = randomColor();
      setColor(next);
      setHexText(next);
      setFareConfigId(null);
    } catch {
      // Success/error toasts are handled by the mutation.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New route</DialogTitle>
            <DialogDescription>
              Create a route to start plotting on the map.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="route-name">Route name</Label>
              <Input
                id="route-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Iloilo City Proper – Oton"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="route-short-name">Short name</Label>
              <Input
                id="route-short-name"
                value={shortName}
                onChange={(event) => setShortName(event.target.value)}
                placeholder="e.g. ILO-OTN"
                maxLength={10}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex items-center gap-1.5">
                <label
                  title="Pick a colour"
                  className="border-border flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-white"
                >
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => {
                      setColor(event.target.value);
                      setHexText(event.target.value);
                    }}
                    aria-label="Route colour"
                    className="size-9 cursor-pointer border-none bg-transparent p-0"
                  />
                </label>
                <Input
                  value={hexText}
                  onChange={(event) => {
                    const value = event.target.value;
                    setHexText(value);
                    if (isValidHexColor(value)) setColor(value);
                  }}
                  aria-label="Route colour (hex)"
                  spellCheck={false}
                  className="h-8 font-mono tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Fare config</Label>
              <FareConfigSelect
                value={fareConfigId}
                onChange={setFareConfigId}
              />
            </div>
          </div>
          <DialogFooter className="flex-col items-stretch gap-2">
            {noFareConfigs && (
              <p className="text-xs text-amber-700">
                No fare config exists yet — routes require one. Create a fare
                config in the Fares section first.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || noFareConfigs}
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
