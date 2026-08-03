import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import prettier from "eslint-config-prettier";
import expoFlat from "eslint-config-expo/flat.js";

const webUiFiles = [
  "apps/web/**/*.{ts,tsx}",
  "packages/ui/**/*.{ts,tsx}",
  "apps/admin/**/*.{ts,tsx}",
];
const mobileFiles = ["apps/mobile/**/*.{ts,tsx,js,jsx,mjs,cjs}"];
const serverFiles = ["apps/server/**/*.ts", "packages/shared/**/*.ts"];

const scopeExpo = (configs) =>
  configs.map((config) => {
    const { files, ignores, ...rest } = config;
    if (files) {
      return {
        ...rest,
        files: files.map((pattern) => `apps/mobile/${pattern}`),
      };
    }
    if (ignores) {
      return {
        ...rest,
        ignores: ignores.map((pattern) => `apps/mobile/${pattern}`),
      };
    }
    return { ...rest, files: mobileFiles };
  });

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/public/**",
      "apps/mobile/.expo/**",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: [...webUiFiles, ...serverFiles],
  })),
  {
    files: webUiFiles,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: webUiFiles,
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["**/*.{js,cjs,mjs}", "**/*.config.ts", ...serverFiles],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  ...scopeExpo(expoFlat),
  {
    files: mobileFiles,
    settings: {
      "import/resolver": {
        typescript: {
          project: ["apps/mobile/tsconfig.json"],
        },
      },
    },
  },
  prettier,
);
