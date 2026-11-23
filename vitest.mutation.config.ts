import { defineConfig } from "vitest/config";

// Usado só pelo Stryker: roda apenas os testes unitários (sem Docker).
export default defineConfig({
  test: { include: ["test/unit/**/*.test.ts"], environment: "node" },
});
