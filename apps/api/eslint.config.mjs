import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,mts,cts,mjs,js}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {},
  },
  {
    files: ["src/common/middleware/request-id.ts"],
    rules: {
      "@typescript-eslint/no-namespace": "off",
    },
  },
);
