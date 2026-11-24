// T009 (feature 006): a auditoria só guarda contagens (D-13).
import { describe, expect, it } from "vitest";
import { assertCountsOnly } from "../../../src/modules/sources/index.js";

describe("assertCountsOnly", () => {
  it("aceita contagens inteiras e não negativas, e detalhes vazios", () => {
    expect(() => assertCountsOnly({ messages: 3, audios: 0 })).not.toThrow();
    expect(() => assertCountsOnly()).not.toThrow();
  });

  it.each([{ title: "Projeto X" }, { phone: "+5511988887777" }, { messages: -1 }, { messages: 1.5 }, { text: null }])("recusa %j", (details) => {
    expect(() => assertCountsOnly(details)).toThrow("A auditoria só guarda contagens.");
  });
});
