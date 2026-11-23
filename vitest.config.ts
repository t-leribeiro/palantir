import { defineConfig } from "vitest/config";

// Pirâmide de testes (RF-19): um projeto Vitest por tipo, cada um com comando próprio.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/main/**", "src/contracts/channel/generated.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "reports/coverage",
    },
    projects: [
      { test: { name: "unit", include: ["test/unit/**/*.test.ts"], environment: "node" } },
      {
        test: {
          name: "architecture",
          include: ["test/architecture/**/*.test.ts", "test/quality/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
      { test: { name: "contract", include: ["test/contract/**/*.test.ts"] } },
      {
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          testTimeout: 120_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: "e2e",
          include: ["test/e2e/**/*.test.ts"],
          testTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
