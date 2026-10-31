import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/shared/BrandMark";
import { NoticePlate } from "@/components/shared/NoticePlate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth";
import {
  passwordChangeErrorMessage,
  validatePasswordChange,
} from "@/features/auth/forcedPasswordChange";
import { getReturnPath } from "@/features/auth/redirect";
import type { PasswordChangeIssue } from "@/features/auth/forcedPasswordChange";

/**
 * `/change-password` — one screen for both flows (ADR-0019 §11, §12).
 *
 * Reached while authenticated but outside the AppShell: a flagged Account has no
 * navigation to use, and a voluntary change should not look like a page in the
 * middle of the workspace. The server, not this form, is what holds the gate —
 * the form only says why a change was refused.
 */
export default function ChangePassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, changeOwnPassword, signOut } = useAuth();

  const forced = user?.mustChangePassword ?? false;
  const returnTo = getReturnPath(location.state);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [issue, setIssue] = useState<PasswordChangeIssue | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = validatePasswordChange({ currentPassword, newPassword });
    if (invalid) {
      setIssue(invalid);
      setRootError(null);
      return;
    }
    setIssue(null);
    setRootError(null);
    setSubmitting(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      toast.success("Password changed");
      // Resume the page the Account was on; the flag is clear, so RequireAuth
      // now lets it through.
      navigate(returnTo, { replace: true });
    } catch (error) {
      setRootError(passwordChangeErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = () => {
    signOut();
    navigate("/login", { replace: true });
  };

  return (
    <main className="bg-background flex min-h-svh flex-col">
      <div className="flex items-center justify-between p-4 lg:p-8">
        <BrandMark />
        <Button variant="ghost" size="sm" type="button" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-sm flex-col gap-6"
          noValidate
        >
          {forced ? (
            <NoticePlate noticeRole="status">
              <KeyRound className="size-4 shrink-0" />
              <span>
                This Account still uses a Temporary Password. Choose your own
                before using the dashboard.
              </span>
            </NoticePlate>
          ) : null}

          <div className="flex flex-col gap-1">
            <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight lg:text-3xl">
              Change password
            </h1>
            <p className="text-muted-foreground text-sm">
              {user?.email ?? "Your Account"}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your current password"
                autoComplete="current-password"
                autoFocus
                aria-invalid={issue?.field === "currentPassword" || undefined}
                aria-describedby={
                  issue?.field === "currentPassword"
                    ? "current-password-error"
                    : undefined
                }
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              {issue?.field === "currentPassword" ? (
                <p
                  id="current-password-error"
                  role="alert"
                  className="text-destructive text-xs"
                >
                  {issue.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Choose a new password"
                  autoComplete="new-password"
                  className="pr-9"
                  aria-invalid={issue?.field === "newPassword" || undefined}
                  aria-describedby={
                    issue?.field === "newPassword"
                      ? "new-password-error"
                      : undefined
                  }
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-ring absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {issue?.field === "newPassword" ? (
                <p
                  id="new-password-error"
                  role="alert"
                  className="text-destructive text-xs"
                >
                  {issue.message}
                </p>
              ) : null}
            </div>
          </div>

          {rootError ? (
            <p role="alert" className="text-destructive text-center text-sm">
              {rootError}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitting ? "Changing..." : "Change password"}
          </Button>
        </form>
      </div>
    </main>
  );
}
