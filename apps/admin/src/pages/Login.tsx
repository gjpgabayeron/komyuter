import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthForm } from "@/components/auth/AuthForm";
import type { LoginFormData } from "@/components/auth/AuthForm";
import { BrandPanel } from "@/components/auth/BrandPanel";
import { ConnectionBanner } from "@/components/shared/ConnectionBanner";
import { BrandMark } from "@/components/shared/BrandMark";
import { useAuth } from "@/features/auth/auth";
import {
  clearSavedReturnPath,
  getReturnPath,
  getSessionExpired,
  readSavedReturnPath,
} from "@/features/auth/redirect";
import { useOnline } from "@/lib/useOnline";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const online = useOnline();

  const returnTo = getReturnPath(location.state);
  const sessionExpired = getSessionExpired(location.state);

  const handleSubmit = async ({ email, password }: LoginFormData) => {
    await signIn(email, password);
    toast.success("Signed in");
    // A saved sessionStorage return path (from the 401 interceptor) wins over
    // location.state — it survives a full reload of the login screen.
    const savedPath = getReturnPath({ returnTo: readSavedReturnPath() });
    clearSavedReturnPath();
    navigate(savedPath !== "/" ? savedPath : returnTo, { replace: true });
  };

  return (
    <main className="bg-background flex min-h-svh flex-col">
      <ConnectionBanner online={online} />
      <div className="grid min-h-svh flex-1 xl:grid-cols-[1.25fr_2fr]">
        <div className="relative flex flex-col items-center justify-center px-4 md:px-6">
          <div className="absolute top-0 flex w-full items-center p-4 lg:p-8">
            <BrandMark />
          </div>
          <div className="w-full max-w-sm">
            <AuthForm onSubmit={handleSubmit} sessionExpired={sessionExpired} />
          </div>
        </div>
        <div className="hidden h-full py-2 xl:flex xl:pr-4">
          <BrandPanel />
        </div>
      </div>
    </main>
  );
}
