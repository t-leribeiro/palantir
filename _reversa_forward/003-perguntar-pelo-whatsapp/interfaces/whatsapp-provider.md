# Interface: provedor WhatsApp e health do processo

## 1. Porta `WhatsAppProvider` (`src/channels/whatsapp/provider/provider.ts`)

O adaptador só conversa com essa porta. A biblioteca não oficial aparece **apenas** em `baileys-provider.ts`, e a regra de arquitetura `whatsapp-lib-isolated` garante isso.

```ts
type SessionState = "pairing" | "connected" | "reconnecting" | "logged_out";

interface IncomingDirect {
  readonly id: string;               // id da mensagem no WhatsApp
  readonly chatJid: string;          // para onde responder (JID 1:1)
  readonly senderPhone: string | null; // E.164 resolvido (D-06); null = não resolvido
  readonly kind: "text" | "audio" | "image" | "document" | "video" | "sticker" | "other";
  readonly text?: string;            // só quando kind = text
  readonly sentAt: Date;
  readonly senderName?: string;      // nome do perfil, só para exibição
}

interface WhatsAppProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  onQr(listener: (qr: string) => void): void;
  onState(listener: (state: SessionState, reason?: string) => void): void;
  onDirectMessage(listener: (message: IncomingDirect) => Promise<void>): void;
  sendText(chatJid: string, text: string): Promise<void>;
}
```

- O provedor já descarta grupos, listas de transmissão, status, canais, reações, mensagens de protocolo e `fromMe` (D-16, D-17).
- `simulated-provider.ts` implementa a mesma porta para testes: injeta mensagens, simula queda, logout e reentrega, e registra os envios.

## 2. Comportamento de sessão (`baileys-provider.ts`)

| Evento do provedor | Estado | Ação |
|--------------------|--------|------|
| `connection.update` com `qr` | `pairing` | entrega o QR ao listener (desenhado no terminal, nunca logado) |
| `connection: "open"` | `connected` | zera o backoff |
| `close` com `restartRequired` (515) | `reconnecting` | reconecta na hora |
| `close` com `loggedOut` (401) | `logged_out` | apaga a sessão, avisa "pareie de novo", não reconecta |
| `close` com outro motivo | `reconnecting` | backoff 1 s, 2 s, 4 s, ... até 60 s, com variação aleatória |
| `creds.update` / chaves alteradas | estado inalterado | grava a sessão criptografada (agrupada em até 1 s, escrita atômica) |
| `messages.upsert` tipo `notify` | estado inalterado | normaliza e entrega mensagens 1:1 |

Opções: `markOnlineOnConnect: false`, `syncFullHistory: false`, `shouldIgnoreJid` (grupos, transmissão, status, canais), logger em nível `error`.

## 3. Envio

- Um envio por destinatário a cada ≥ 1 s (D-12). Partes de uma mesma resposta saem em ordem.
- Falha de envio: 3 tentativas com espera de 1 s, 2 s e 4 s; depois registra `error` (sem conteúdo) e desiste da resposta.
- Timeout por envio: 30 s.

## 4. Health do processo (`GET /health` na porta `PALANTIR_WHATSAPP_HEALTH_PORT`, padrão 8081)

```json
{ "status": "ok", "checks": { "db": "ok", "whatsapp": "connected" } }
```

| `whatsapp` | HTTP |
|------------|------|
| `connected` | 200 |
| `pairing`, `reconnecting` | 503 |
| `logged_out` | 503 |

Sem dados pessoais no corpo (nem número, nem nome).

## 5. Idempotência

- Cada mensagem direta gera um recibo (`agent_inbound_receipts`) antes de qualquer resposta; se o recibo já existir, a mensagem é ignorada (D-13).
- Mensagens com mais de 10 min na chegada são ignoradas e contadas em `whatsapp_messages_received_total{kind="stale"}`.
