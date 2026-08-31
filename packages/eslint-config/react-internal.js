import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { config as baseConfig } from "./base.js";

const typedSourceFiles = [
  "src/**/*.{ts,tsx,mts,cts}",
  "test/**/*.{ts,tsx,mts,cts}",
];
const untypedFiles = [
  "scripts/**/*.{js,mjs,cjs,ts,tsx,mts,cts}",
  "**/*.config.{js,mjs,cjs,ts,tsx,mts,cts}",
  "**/eslint.config.{js,mjs,cjs,ts,tsx,mts,cts}",
];

/**
 * A custom ESLint configuration for libraries that use React.
 *
 * @type {import("eslint").Linter.Config[]} */
export const config = [
  ...baseConfig,
  ...tseslint.configs.recommendedTypeChecked.map((typedConfig) => ({
    ...typedConfig,
    files: typedSourceFiles,
  })),
  {
    files: typedSourceFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: untypedFiles,
  },
  {
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
  pluginReactHooks.configs.flat.recommended,
  eslintConfigPrettier,
];
