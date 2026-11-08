import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Build-time Content-Security-Policy (US4 / R6, contract:
 * specs/009-auth-quick-wins/contracts/csp-policy.md). Emits a
 * `<meta http-equiv="Content-Security-Policy">` into the built index.html.
 *
 * Applied ONLY in production builds: dev mode keeps no CSP because Vite HMR
 * needs inline scripts/styles. `<API_ORIGIN>` is substituted from
 * `VITE_API_URL` (the origin the built app talks to); when unset, the
 * directive simply omits it.
 */
function cspPlugin(): Plugin {
  let mode = "development";
  let apiOrigin = "";

  return {
    name: "komyuter-csp",
    configResolved(config) {
      mode = config.mode;
      const env = loadEnv(config.mode, process.cwd(), "");
      const raw = env.VITE_API_URL;
      if (raw) {
        try {
          apiOrigin = new URL(raw).origin;
        } catch {
          apiOrigin = raw;
        }
      }
    },
    transformIndexHtml() {
      if (mode !== "production") {
        return undefined;
      }
      const policy = [
        "default-src 'self';",
        "script-src 'self';",
        "style-src 'self';",
        "worker-src 'self' blob:;",
        "img-src 'self' data: blob: https://tiles.openfreemap.org;",
        "font-src 'self' data:;",
        `connect-src 'self' https://tiles.openfreemap.org${apiOrigin ? ` ${apiOrigin}` : ""};`,
        "object-src 'none';",
        "base-uri 'self';",
        "form-action 'self'",
      ].join(" ");
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: policy,
          },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
