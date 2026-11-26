# Investigation: Ver a mensagem original com contexto (fatia S7)

> Identificador: `008-mostrar-original-com-contexto`
> Data: `2026-11-25`

## 1. O que já existe e é reaproveitado

- **Citações numeradas:** `composeAnswer` (`agent/domain/answer.ts`) gera até 3 citações com `messageId`, `kind` e a faixa do áudio (contrato 1.3.0). Falta só guardá-las.
- **Estado curto:** `agent_conversation_state` (S5) guarda, por usuário e canal, a lista de grupos (30 min) e a ação pendente (5 min). Cabem mais duas colunas.
- **Comandos fixos:** `normalizeText` e a ordem em `answerActive` (S5).
- **Índice de vizinhança:** `messages_source_sent_at (source_id, sent_at)`, da S3.
- **Áudio guardado:** os 160 anexos de áudio do T3 estão `stored` no SeaweedFS, cifrados com AES-256-GCM e com o SHA-256 registrado (S4). `ObjectStore.get` decifra.
- **Transcrição:** `transcripts` (ativa) e `transcript_segments` (`start_s`, `end_s`, `text`).
- **Divisão do texto longo:** os dois adaptadores dividem em partes de 4.000 caracteres.

## 2. Alternativas avaliadas

### Entrega do áudio
| Opção | Prós | Contras | Veredito |
|-------|------|---------|----------|
| URL temporária (spec `media-transcription` RF-09) | Simples no núcleo | O SeaweedFS é local: o link não abre no celular. Expor exigiria túnel ou servidor público | Descartada (já na S4) |
| Bytes em base64 dentro do `AgentReply` | Um envio só | Um JSON validado de vários MB; o contrato deixa de ser "resposta pequena e neutra" | Descartada |
| **Referência no `AgentReply` e loader injetado no adaptador** | O núcleo continua sem bytes; o adaptador não conhece armazenamento; a checagem do dono fica no núcleo | Uma porta a mais no contrato | **Escolhida (D-07, D-08)** |

### Formato no WhatsApp
- **Mensagem de voz** (`ptt: true`), com Ogg/Opus, como o áudio original chegou: o WhatsApp mostra o player. **Escolhida.**
- **Documento:** abre fora do player. Plano B, se o `ptt` falhar no Baileys rc.

### Contexto
- **Por horário na mesma fonte** (3 antes e 3 depois): funciona para importadas e capturadas. **Escolhida.**
- **Por resposta citada** (`quoted_message_id`): poucas mensagens usam, e as importadas não têm esse vínculo. Fica como melhoria.

### Onde guardar as citações
- **Colunas em `agent_conversation_state`. Escolhida:** uma linha por dono e canal, já existe.
- **`AgentSession` da spec** (10 trocas e expiração): maior do que esta fatia precisa.

## 3. Limites considerados

- **WhatsApp:**
  - texto de até 4.096 caracteres por mensagem (usamos 4.000);
  - áudio de até 16 MB;
  - um áudio de voz em Opus a ~16 kbit/s tem ~2 MB por 15 min, então os 60 min máximos da S4 cabem.
- **Contrato:** `AgentReply.text` tem até 20.000 caracteres. A transcrição de um áudio de 60 min passa disso, daí a janela de 6.000 (D-06).
- **Export do WhatsApp:** hora só até o minuto. Várias mensagens no mesmo minuto: o desempate por `id` dá ordem estável, mas não necessariamente a de envio. Para as capturadas ao vivo, o horário tem segundos.

## 4. Padrões aplicáveis

- Ports and adapters (ADR-0001): `SourceContext` no `retrieval`, `OutboundMediaLoader` no contrato do canal, composição só no `src/main`.
- Contrato versionado aditivo (ADR-0004): 1.3.0 para 1.4.0.
- Compositor determinístico (ADR-0007): a resposta continua sem LLM.

## 5. Fontes

- `_reversa_sdd/sdd/conversational-agent.md` (RF-06, RF-09, EC-05)
- `_reversa_sdd/sdd/retrieval.md` (RF-07, EC-05)
- `_reversa_sdd/sdd/media-transcription.md` (RF-09)
- `_reversa_sdd/addenda/005-perguntar-sobre-audios.md`, `006-gerenciar-grupos-pelo-agente.md`, `007-achar-assunto-outras-palavras.md`
- Código: `src/modules/agent/**`, `src/contracts/channel/knowledge-channel.ts`, `src/channels/whatsapp/**`, `src/channels/fake/fake-channel.ts`, `migrations/0003`, `0006`, `0007` e `0008`
