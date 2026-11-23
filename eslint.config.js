// ESLint flat config. Complexidade ciclomática ≤ 10 por função (ADR-0005, RNF-06).
import js from "@eslint/js";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".agents/**",
      ".claude/**",
      ".reversa/**",
      "_reversa_*/**",
      "dist/**",
      "coverage/**",
      "reports/**",
      ".stryker-tmp/**",
      "node_modules/**",
      "src/contracts/channel/generated.ts",
      "test/architecture/fixtures/**",
      "test/quality/fixtures/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  comments.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { process: "readonly", console: "readonly", URL: "readonly" },
    },
    rules: {
      complexity: ["error", { max: 10 }],
      // Toda desativação de regra precisa de justificativa após "--".
      "@eslint-community/eslint-comments/require-description": ["error", { ignore: [] }],
      "@eslint-community/eslint-comments/no-unused-disable": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "no-console": ["error", { allow: ["error"] }],
    },
  },
  {
    files: ["scripts/**", "test/load/**", "*.config.*", "eslint.config.js"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { module: "writable", require: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
