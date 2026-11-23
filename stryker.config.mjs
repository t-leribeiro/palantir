// Testes de mutação (RF-19). Escopo: domínio e aplicação dos módulos do núcleo.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.mutation.config.ts", related: false },
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: ["src/modules/*/domain/**/*.ts", "src/modules/*/application/**/*.ts", "!src/**/index.ts"],
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  reporters: ["clear-text", "progress", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  thresholds: { high: 80, low: 60, break: 60 },
  concurrency: 4,
  tempDirName: ".stryker-tmp",
};
