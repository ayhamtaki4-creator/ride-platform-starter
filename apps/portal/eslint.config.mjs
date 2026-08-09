import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // Existing data-loading effects predate the React Compiler lint rule.
      // Keep every occurrence visible in CI as a warning, then migrate screens
      // incrementally instead of weakening runtime safety with a bulk rewrite.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    ".open-next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
