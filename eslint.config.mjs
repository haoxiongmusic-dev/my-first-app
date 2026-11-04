import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Our own: app data, test videos, Python code, HyperFrames templates.
    "storage/**",
    "test-renders/**",
    "analyzer/**",
    "templates/**",
  ]),
  // Must stay last: turns off ESLint rules that would fight Prettier's formatting.
  prettier,
]);

export default eslintConfig;
