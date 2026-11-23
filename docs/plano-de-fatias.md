# Plano de entregas por fatias (v0.1)

> Decidido em 2026-11-23. Cada fatia atravessa todas as camadas e termina com algo que dá para usar e demonstrar.
> Atualize a coluna **Status** a cada entrega (ver "Como manter este arquivo").

## Status

| Fatia | Feature | Ao final, você consegue | Status | PR | Decisão pendente |
|-------|---------|-------------------------|--------|----|------------------|
| S0 | `001-walking-skeleton` | Caminho ponta a ponta com canal de teste e todos os gates de qualidade | ✅ entregue (2026-11-23) | #1, #2 | – |
| S1 | `002-perguntar-historico-importado` | Exportar um grupo real, importar o ZIP (só os textos) e perguntar sobre as conversas antigas pelo canal de teste | ✅ entregue (2026-11-23) | #3, #4 (correções do export real) | – (grupo da demo escolhido na hora) |
| S2 | – | Perguntar pelo WhatsApp a um número dedicado e receber a resposta com citação, sobre o histórico importado | ⏳ planejada | – | Um número ou dois; chip secundário |
| S3 | – | Mensagem nova num grupo de teste autorizado aparece nas respostas em segundos, sem duplicar o que veio da importação | ⏳ planejada | – | Grupo de teste e consentimento dos participantes |
| S4 | – | "Em qual áudio alguém falou de X?" devolve o áudio certo, importado ou ao vivo | ⏳ planejada | – | Modelo de transcrição local (com medição) |
| S5 | – | Listar, autorizar, parar de acompanhar e apagar grupos conversando com o agente, com verificação da conta | ⏳ planejada | – | Base legal na LGPD antes de sair dos grupos de teste |
| S6 | – | Achar mensagens do mesmo assunto ditas com outras palavras; `npm run eval` mostra a melhora | ⏳ planejada | – | Modelo de embeddings local (com medição) |
| S7 | – | "mostra a 2" traz a mensagem original com contexto ou o trecho do áudio | ⏳ planejada | – | – |
| S8 | – | Encaminhar um conteúdo com "guarda isso em X" e recuperar depois pelo tema | ⏳ planejada | – | – |
| S9 | – | Respostas naturais e resumos por tema e período, com citações conferidas | ⏳ planejada | – | LLM local ou pago |

Legenda: ✅ entregue · 🔄 em andamento · ⏳ planejada · ⛔ bloqueada

## Componentes (specs) por fatia

| Fatia | Specs em `_reversa_sdd/sdd/` |
|-------|------------------------------|
| S1 | `whatsapp-export-importer` (só texto), `ingestion` (chave de importação) |
| S2 | `whatsapp-baileys-adapter` (só interface do agente), `identity-and-sources` (cadastro do número por comando) |
| S3 | `whatsapp-baileys-adapter` (captura), `ingestion` (reconciliação ao vivo × importado) |
| S4 | `media-transcription`, `channel-contract` (`fetchMedia`), `whatsapp-export-importer` (mídias) |
| S5 | `identity-and-sources` (verificação, opt-in, revogação, exclusão, auditoria) |
| S6 | `knowledge-indexing` (embeddings), `retrieval` (busca híbrida) |
| S7 | `conversational-agent` (mostrar original), `retrieval` (contexto) |
| S8 | `knowledge-indexing` (`KnowledgeItem`, temas), `conversational-agent` (guardar) |
| S9 | `conversational-agent` (LLM, intenções, resumos, sessão) |

## Regras do plano

1. **Fatias pequenas:** no máximo ~15 ações no `actions.md`, uma rodada de coding, um PR por fatia.
2. **Decisão na hora certa:** cada decisão pendente é tomada antes do coding da fatia que precisa dela, não antes.
3. **Toda fatia termina demonstrável:** roteiro curto no `onboarding.md` da feature (o que fazer e o que você deve ver) e `npm run eval` com os números da fatia.
4. **Validação antes do código:** o artefato de validação é atualizado antes de cada coding.
5. **Se uma fatia falhar** (ex.: bloqueio do número na S2/S3), as anteriores continuam funcionando pelo canal de teste; a ordem pode ser revista aqui.

## Como manter este arquivo

- Ao iniciar uma fatia: preencher **Feature** e mudar **Status** para 🔄.
- Ao mergear o PR da fatia: mudar para ✅ com a data e preencher **PR**.
- Mudança de escopo ou ordem: editar a tabela e registrar no histórico abaixo.

## Histórico

| Data | Mudança |
|------|---------|
| 2026-11-23 | Plano por fatias aprovado, substituindo a sequência por componentes. S1 iniciada como feature `002`. |
| 2026-11-23 | S1 entregue: importação de conversas exportadas (14 ações, PR #3). 10.000 mensagens em 53,5 s. |
| 2026-11-23 | Primeiro export real (só local, em `exports/`) expôs 5 defeitos do parser, registrados em `_reversa_bugs/importacao-whatsapp/` e corrigidos no PR #4. |
