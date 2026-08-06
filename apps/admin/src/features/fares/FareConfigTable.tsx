import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FareConfigListItem } from "./api";
import { formatKm, formatPct, formatPeso } from "./format";

interface FareConfigTableProps {
  configs: FareConfigListItem[];
}

/** Default first, then label — the table's reading order (plan §list). */
function sortConfigs(configs: FareConfigListItem[]): FareConfigListItem[] {
  return [...configs].sort(
    (a, b) =>
      Number(b.is_default) - Number(a.is_default) ||
      a.label.localeCompare(b.label),
  );
}

function deleteGuardLabel(config: FareConfigListItem): string | null {
  if (config.active_route_count > 0) {
    const plural = config.active_route_count === 1 ? "" : "s";
    return `In use by ${config.active_route_count} active route${plural}`;
  }
  if (config.is_default) {
    return "The default cannot be deactivated while it is the only default";
  }
  return null;
}

/** Sticky header styling: keeps column labels in view while the table body scrolls. */
const thClass = "bg-muted sticky top-0 z-10";

export function FareConfigTable({ configs }: FareConfigTableProps) {
  const rows = sortConfigs(configs);

  return (
    <TooltipProvider>
      <Table containerClassName="max-h-[65vh] rounded-md border">
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className={thClass}>
              Label
            </TableHead>
            <TableHead scope="col" className={thClass}>
              Status
            </TableHead>
            <TableHead scope="col" className={thClass}>
              Base fare
            </TableHead>
            <TableHead scope="col" className={thClass}>
              Base distance (km)
            </TableHead>
            <TableHead scope="col" className={thClass}>
              Rate/km
            </TableHead>
            <TableHead scope="col" className={thClass}>
              Student / Senior
            </TableHead>
            <TableHead scope="col" className={cn(thClass, "text-right")}>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((config) => {
            const guardLabel = deleteGuardLabel(config);
            const deleteDisabled = guardLabel !== null;

            return (
              <TableRow
                key={config.fare_config_id}
                className={cn(!config.is_active && "text-muted-foreground")}
              >
                <TableCell className="font-medium">
                  {config.label}
                  {config.is_default && (
                    <Badge className="bg-warning text-warning-foreground ml-2">
                      Default
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {config.is_active ? (
                    <Badge variant="default">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>{formatPeso(config.base_fare)}</TableCell>
                <TableCell>{formatKm(config.base_distance_km)}</TableCell>
                <TableCell>{formatPeso(config.rate_per_km)}/km</TableCell>
                <TableCell>
                  {formatPct(config.student_discount_pct)} /{" "}
                  {formatPct(config.senior_discount_pct)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled
                    aria-label={`Edit ${config.label}`}
                  >
                    <Pencil />
                  </Button>
                  {deleteDisabled ? (
                    <Tooltip>
                      <TooltipTrigger render={<span className="inline-flex" />}>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled
                          aria-label={`Deactivate ${config.label} (disabled: ${guardLabel})`}
                        >
                          <Trash2 />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{guardLabel}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled
                      aria-label={`Deactivate ${config.label}`}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
