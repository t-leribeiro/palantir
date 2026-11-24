# Plano de entregas por fatias (v0.1)

> Decidido em 2026-11-23. Cada fatia atravessa todas as camadas e termina com algo que dá para usar e demonstrar.
> Atualize a coluna **Status** a cada entrega (ver "Como manter este arquivo").

## Status

| Fatia | Feature | Ao final, você consegue | Status | PR | Decisão pendente |
|-------|---------|-------------------------|--------|----|------------------|
| S0 | `001-walking-skeleton` | Caminho ponta a ponta com canal de teste e todos os gates de qualidade | ✅ entregue (2026-11-23) | #1, #2 | – |
| S1 | `002-perguntar-historico-importado` | Exportar um grupo real, importar o ZIP (só os textos) e perguntar sobre as conversas antigas pelo canal de teste | ✅ entregue (2026-11-23) | #3, #4 (correções do export real), #8 (legendas de mídia) | – (grupo da demo escolhido na hora) |
| S2 | `003-perguntar-pelo-whatsapp` | Perguntar pelo WhatsApp a um número dedicado e receber a resposta com citação, sobre o histórico importado | ✅ entregue (2026-11-23) | #5 | – (decidido em 2026-11-23: dois números; o chip secundário é o do agente) |
| S3 | `004-captura-ao-vivo-grupo-teste` | Mensagem nova num grupo de teste autorizado aparece nas respostas em segundos, sem duplicar o que veio da importação | ✅ entregue (2026-11-23) | #7, #9 | – (decidido em 2026-11-23: o número do agente captura até existir o segundo chip; consentimento declarado no comando; ligação explícita com a importação) |
| S4 | `005-perguntar-sobre-audios` | "Em qual áudio alguém falou de X?" devolve o áudio certo, importado ou ao vivo | ✅ entregue (2026-11-24) | #11, #12 | – (decidido em 2026-11-23: resposta só em texto com o ponto do trecho; só áudio guardado, caminho pronto para outras mídias; motor substituível, inclusive SaaS; modelo escolhido pela medição com áudios reais transcritos à mão e FLEURS; em 2026-11-24 o usuário escolheu o large-v3-turbo) |
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
| 2026-11-23 | S2 iniciada como feature `003`. Decisão: dois números (agente e captura); o chip secundário é o do agente. 17 ações (acima das ~15 da regra, por ser a primeira integração externa real). |
| 2026-11-23 | S2 entregue e demonstrada com o chip real (PR #5): pergunta pelo WhatsApp respondida com citações sobre o export real, reinício sem novo QR. A demonstração expôs um defeito na reconexão logo após o pareamento, corrigido no mesmo PR. O guia de teste passou a incluir os pré-requisitos das fatias anteriores (Node 22, worker rodando, importação). |
| 2026-11-23 | S3 iniciada como feature `004`. Decisões: o número do agente captura provisoriamente (modo `agent`, risco de bloqueio conjunto aceito), consentimento declarado no comando de autorização, grupo ligado à importação só por `--conversa`, autor pelo nome de perfil. 16 ações. |
| 2026-11-23 | S3 entregue e demonstrada com o chip real (PR #7; adendo no PR #9): mensagem nova num grupo de teste autorizado respondida pelo agente com citação. A demonstração expôs dois problemas: um grupo de nome parecido foi autorizado por engano (agora `--conversa` exige o mesmo nome do grupo ou `--confirmar`, no PR #7) e as legendas de mídia eram descartadas na importação (bug #6, PR #8). |
| 2026-11-23 | S4 iniciada como feature `005`. Decisões: resposta só em texto (o arquivo do áudio fica para a S7), só áudio guardado num caminho comum a todas as mídias, transcrição local atrás de uma porta substituível (Whisper em CPU pelo Speaches; SaaS só por escolha explícita), modelo escolhido por medição. 21 ações, acima das ~15 da regra, mantidas numa fatia só. |
| 2026-11-24 | S4 entregue e demonstrada com o chip real (PR #11; emenda E001 no PR #12): o áudio mandado ao vivo no grupo autorizado e um áudio do T3 importado foram respondidos com autor, conversa, data, duração e ponto do trecho. Medição: nenhum modelo cumpriu tempo real ≤ 0,5 na CPU do notebook; o usuário escolheu o `large-v3-turbo` (3,5% de WER no FLEURS, ~1,4× a duração do áudio), registrado no ADR-0010. A demonstração expôs três problemas, corrigidos: a medição acumulava modelos na memória do motor, as referências reais eram rascunhos do turbo (a ferramenta agora avisa) e "em qual áudio..." usava "áudio" como termo de busca e misturava mensagens de texto (E001). A transcrição dos 158 áudios do T3 segue em segundo plano. |
