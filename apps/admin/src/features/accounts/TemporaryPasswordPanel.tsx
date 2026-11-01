import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TemporaryPasswordPanelProps {
  /** The generated Temporary Password, held in memory for this panel only. */
  temporaryPassword: string;
}

/**
 * The once-only handover panel shared by the invite and the forced reset
 * (ADR-0019 §10, §13–14). It shows the server-generated Temporary Password in a
 * read-only field with a Copy action, and says plainly that the value cannot be
 * shown again — closing the dialog discards it for good. There is no second read:
 * this panel is the only place the credential is ever visible.
 */
export function TemporaryPasswordPanel({
  temporaryPassword,
}: TemporaryPasswordPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      toast.success("Temporary Password copied.");
    } catch {
      toast.error("Could not copy — select the password and copy it manually.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="temporary-password">Temporary Password</Label>
        <div className="flex items-center gap-2">
          <Input
            id="temporary-password"
            value={temporaryPassword}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            className="h-9 font-mono tracking-wide"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyPassword}
            aria-label="Copy Temporary Password"
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-amber-700">
        This Temporary Password cannot be shown again. Copy it now and hand it
        over securely — if it is lost, the Account has to be reset.
      </p>
    </div>
  );
}
