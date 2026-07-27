import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Flat config (ESLint 9). Lints the API and shared packages. The Next.js app
// keeps its own `next lint`. Type-aware linting is intentionally off here to
// keep CI fast and deterministic — `tsc --noEmit` already enforces types.
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/*.config.*",
      "**/*.d.ts",
      "**/generated/**"
    ]
  },
  {
    files: ["apps/api/src/**/*.ts", "packages/*/src/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  }
);
