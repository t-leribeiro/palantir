// T046 / RF-06: as rotas registradas no servidor são exatamente as declaradas em contracts/openapi.yaml.
import { describe, expect, it } from "vitest";
import { declaredOperations } from "../../src/platform/http/openapi.js";
import { buildTestApp } from "../support/http-app.js";

describe("conformidade com a OpenAPI", () => {
  it("registra exatamente as operações declaradas na especificação", async () => {
    const { app, routes } = await buildTestApp();
    expect([...new Set(routes)].sort()).toEqual(declaredOperations());
    await app.close();
  });
});
