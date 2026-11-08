import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Dropdown that picks a stop's chain neighbour on one side. */
export function ConnectionSelect({
  label,
  value,
  options,
  onSelect,
  disabled,
}: {
  label: string;
  value: string | null;
  options: { id: string; name: string }[];
  onSelect: (id: string | null) => void;
  disabled: boolean;
}) {
  const selected = options.find((option) => option.id === value) ?? null;
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground text-[11px]">{label}</Label>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(props) => (
            <button
              {...props}
              type="button"
              disabled={disabled}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "w-full justify-between font-normal",
              )}
            >
              <span className="truncate">
                {selected ? selected.name : "None"}
              </span>
              <ChevronDown className="size-3.5" />
            </button>
          )}
        />
        <DropdownMenuContent align="start" className="w-56 p-1">
          <DropdownMenuRadioGroup
            value={value ?? ""}
            onValueChange={(next) => onSelect(next === "" ? null : next)}
          >
            <DropdownMenuRadioItem value="">None</DropdownMenuRadioItem>
            {options.map((option) => (
              <DropdownMenuRadioItem key={option.id} value={option.id}>
                {option.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
