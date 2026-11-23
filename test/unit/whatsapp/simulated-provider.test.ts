// T008 (feature 004, D-03, D-15): simulador com grupos, usado pela suíte de contrato e pelo E2E.
import { describe, expect, it } from "vitest";
import { createSimulatedProvider } from "../../../src/channels/whatsapp/provider/simulated-provider.js";
import type { GroupInfo, IncomingGroupMessage } from "../../../src/channels/whatsapp/provider/provider.js";

const GROUP: IncomingGroupMessage = { id: "G-1", groupId: "120363000000000001@g.us", senderPhone: "+5511988887777", kind: "text", text: "oi", sentAt: new Date() };
const info = (groupId: string, subject: string): GroupInfo => ({ groupId, subject, participants: 3 });

describe("provedor simulado com grupos", () => {
  it("entrega mensagem de grupo ao listener e espera ele terminar", async () => {
    const provider = createSimulatedProvider();
    const received: IncomingGroupMessage[] = [];
    provider.onGroupMessage(async (m) => void received.push(m));
    await provider.deliverGroup(GROUP);
    expect(received).toEqual([GROUP]);
  });

  it("sem listener de grupo, entregar é erro", async () => {
    await expect(createSimulatedProvider().deliverGroup(GROUP)).rejects.toThrow(/grupo/);
  });

  it("lista completa troca os grupos; parcial só atualiza; listeners recebem o aviso", async () => {
    const provider = createSimulatedProvider();
    const events: [string[], boolean][] = [];
    provider.onGroupsChanged((groups, complete) => events.push([groups.map((g) => g.subject), complete]));
    provider.setGroups([info("1@g.us", "a"), info("2@g.us", "b")]);
    provider.setGroups([info("2@g.us", "b2")], false);
    expect((await provider.listGroups()).map((g) => g.subject)).toEqual(["a", "b2"]);
    provider.setGroups([info("3@g.us", "c")]);
    expect((await provider.listGroups()).map((g) => g.subject)).toEqual(["c"]);
    expect(events).toEqual([
      [["a", "b"], true],
      [["b2"], false],
      [["c"], true],
    ]);
  });

  it("recusa enviar a grupo, mesmo conectado", async () => {
    const provider = createSimulatedProvider();
    await provider.start();
    await expect(provider.sendText("120363000000000001@g.us", "oi")).rejects.toThrow("envio a grupo bloqueado");
    expect(provider.sent()).toEqual([]);
  });
});
