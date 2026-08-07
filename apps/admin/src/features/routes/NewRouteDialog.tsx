import { useState } from "react";
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
import { usePlottingStore } from "@/lib/plottingStore";
import { FareConfigSelect } from "./FareConfigSelect";
import { isValidHexColor, ROUTE_COLORS } from "./routeColors";
import { useCreateRouteMutation } from "./useRouteQueries";

interface NewRouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const randomColor = () =>
  ROUTE_COLORS[Math.floor(Math.random() * ROUTE_COLORS.length)];

/** Minimal create-route form (FR-002/FR-030): name, short name, colour, fare. */
export function NewRouteDialog({ open, onOpenChange }: NewRouteDialogProps) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [color, setColor] = useState<string>(randomColor);
  const [hexText, setHexText] = useState(color);
  const [fareConfigId, setFareConfigId] = useState<string | null>(null);

  const createMutation = useCreateRouteMutation();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !shortName.trim()) return;
    try {
      const route = await createMutation.mutateAsync({
        name: name.trim(),
        short_name: shortName.trim(),
        color,
        fare_config_id: fareConfigId ?? undefined,
      });
      // Select the new route as the active plotting surface (FR-002).
      usePlottingStore.getState().openRoute(route.route_id);
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
