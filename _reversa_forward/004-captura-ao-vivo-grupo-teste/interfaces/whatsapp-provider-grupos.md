# Interface: porta `WhatsAppProvider`, extensão para grupos

> Feature: `004-captura-ao-vivo-grupo-teste` (RF-01, RF-04, RF-05, RF-09, RF-12; D-03, D-11, D-12, D-15)
> Base: `_reversa_forward/003-perguntar-pelo-whatsapp/interfaces/whatsapp-provider.md`
> Arquivo: `src/channels/whatsapp/provider/provider.ts`

## Opções

`createBaileysProvider({ store, log, acceptGroups })`:
- `acceptGroups: false`, o padrão: grupos são ignorados no `shouldIgnoreJid`, como na S2.
- `acceptGroups: true`: transmissões, status e canais (`@broadcast`, `@newsletter`) continuam ignorados, e grupos (`@g.us`) passam a ser entregues.

No modo `dedicated`, o segundo provedor usa `createEncryptedFileStore({ ..., fileName: "capture-session.enc" })`.

## Tipos novos

```ts
export interface IncomingGroupMessage {
  readonly id: string;              // key.id
  readonly groupId: string;         // "<número>@g.us"
  /** E.164 do autor; null quando só há LID sem mapeamento. */
  readonly senderPhone: string | null;
  /** "lid:<id>" quando o autor só é conhecido por LID; ausente quando há telefone. */
  readonly senderLid?: string;
  readonly senderName?: string;     // pushName
  readonly kind: DirectKind;        // mesma classificação da S2
  readonly text?: string;
  readonly sentAt: Date;
}

export interface GroupInfo {
  readonly groupId: string;
  readonly subject: string;
  readonly participants: number;
}
```

## Métodos novos

| Método | Contrato |
|--------|----------|
| `onGroupMessage(listener: (m: IncomingGroupMessage) => Promise<void>)` | Só para `messages.upsert` do tipo `notify`, com `remoteJid` terminado em `@g.us`, sem `fromMe` e com conteúdo classificado (protocolo, reação e edição continuam ignorados). Erros do listener são registrados sem conteúdo e não derrubam o socket |
| `listGroups(): Promise<readonly GroupInfo[]>` | `groupFetchAllParticipating()`; chamado ao conectar. Sem conexão, lança erro |
| `onGroupsChanged(listener: (groups: readonly GroupInfo[], complete: boolean) => void)` | `complete = true` com a lista inteira (ao conectar, em `groups.update` e quando entra ou sai participante, via `groupFetchAllParticipating`): quem não está nela saiu. `complete = false` em `groups.upsert` (grupo novo) |

O autor de grupo é resolvido em `key.participant`, depois em `key.participantAlt` e depois em `signalRepository.lidMapping.getPNForLID(participant)`, sempre normalizado por `normalizePhone` (nono dígito). Esse é o comportamento da S2 para mensagens diretas, aplicado ao participante.

## Mudança em método existente

`sendText(chatJid, text)` lança `Error("envio a grupo bloqueado")` quando `chatJid` termina em `@g.us` (D-15). Nenhum caminho do canal chama `sendText` para grupo; a trava existe para o caso de regressão.

## Simulador (`simulated-provider.ts`)

- `deliverGroup(message: IncomingGroupMessage)`
- `setGroups(groups: GroupInfo[])`, que dispara `onGroupsChanged`
- `listGroups()` devolve o último `setGroups`
- `sendText` aplica a mesma trava de grupo

## Idempotência e tempo

O provedor não deduplica: o canal consulta a ingestão, que deduplica por `(source_id, external_message_id)`. `listGroups` tem o timeout padrão da biblioteca; uma falha só deixa o diretório desatualizado e é registrada como aviso.
