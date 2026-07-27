import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// ESLint 9 flat config for apps/web (TD-004). Replaces the deprecated
// `next lint` (removed in Next 16) with the ESLint CLI, aligning the whole repo
// on flat config. FlatCompat loads Next's shareable configs (core-web-vitals +
// typescript), which bundle the Next, React and react-hooks plugins.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Match the repo-wide convention: a leading underscore marks an
    // intentionally unused binding (args, vars, caught errors).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ]
    }
  }
];

export default eslintConfig;
