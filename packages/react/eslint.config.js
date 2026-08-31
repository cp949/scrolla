import { config } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "test/fixtures/**",
      "test/browser-fixtures/**/dist/**",
      "test/consumer-fixtures/**/dist/**",
      "test/consumer-fixtures/**/.next/**",
    ],
  },
  ...config,
  {
    files: ["**/scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
      },
    },
  },
];
