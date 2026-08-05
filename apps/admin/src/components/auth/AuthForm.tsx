import { useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";

export interface LoginFormData {
  email: string;
  password: string;
}

interface AuthFormProps {
  onSubmit: (data: LoginFormData) => Promise<void>;
}

interface FieldErrors {
  email?: string;
  password?: string;
  root?: string;
}

function messageForError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "UNAUTHORIZED":
        return "Invalid email or password. Please try again.";
      case "FORBIDDEN":
        return "This account does not have administrator access.";
      case "VALIDATION_ERROR":
        return "Please check your details and try again.";
      case "NETWORK":
        return "Cannot reach the server. Check your connection and try again.";
      default:
        return "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

export function AuthForm({ onSubmit }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!email.trim()) {
      next.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = "Please enter a valid email";
    }
    if (!password) {
      next.password = "Password is required";
    }
    setErrors(next);
    return !next.email && !next.password;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});
    try {
      await onSubmit({ email: email.trim(), password });
    } catch (error) {
      const message = messageForError(error);
      setErrors({ root: message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight lg:text-3xl">
          Sign in to Komyuter
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage Iloilo&apos;s jeepney routes
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="admin@komyuter.ph"
            autoComplete="email"
            autoFocus
            aria-invalid={errors.email ? "true" : undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {errors.email ? (
            <p
              id="email-error"
              role="alert"
              className="text-destructive text-xs"
            >
              {errors.email}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              autoComplete="current-password"
              aria-invalid={errors.password ? "true" : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              className="pr-9"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {errors.password ? (
            <p
              id="password-error"
              role="alert"
              className="text-destructive text-xs"
            >
              {errors.password}
            </p>
          ) : null}
        </div>
      </div>

      {errors.root ? (
        <p role="alert" className="text-destructive text-center text-sm">
          {errors.root}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
        {submitting ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
