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
| S4 | `005-perguntar-sobre-audios` | "Em qual áudio alguém falou de X?" devolve o áudio certo, importado ou ao vivo | ✅ entregue (2026-11-24) | #11, #12, #18 (áudios longos e de duração decimal) | – (decidido em 2026-11-23: resposta só em texto com o ponto do trecho; só áudio guardado, caminho pronto para outras mídias; motor substituível, inclusive SaaS; modelo escolhido pela medição com áudios reais transcritos à mão e FLEURS; em 2026-11-24 o usuário escolheu o large-v3-turbo) |
| S5 | `006-gerenciar-grupos-pelo-agente` | Listar, autorizar, parar de acompanhar e apagar grupos conversando com o agente, com verificação da conta | ✅ entregue (2026-11-24) | #14 | – (decidido em 2026-11-24: base legal por consentimento declarado por grupo; código mostrado no terminal e mandado ao agente; contas já ativas verificam de novo; filtro por grupo na pergunta entra na S5) |
| S6 | `007-achar-assunto-outras-palavras` | Achar mensagens do mesmo assunto ditas com outras palavras; `npm run eval` mostra a melhora | ✅ entregue (2026-11-25) | #16 | – (decidido em 2026-11-24: cálculo local por padrão, trocável por um serviço online por configuração; Jev como verificador opcional, desligado; medição com perguntas reais do T3; citação igual às outras; meta de 90% no "não encontrei") |
| S7 | `008-mostrar-original-com-contexto` | "mostra a 2" traz a mensagem original com contexto ou o trecho do áudio | 🔄 em andamento | – | – (decidido em 2026-11-25: o áudio volta como arquivo junto da transcrição completa; 3 mensagens antes e 3 depois; "mostra a N" vale 2 h) |
| S8 | – | Encaminhar um conteúdo com "guarda isso em X" e recuperar depois pelo tema | ⏳ planejada | – | – |
| S9 | – | Respostas naturais e resumos por tema e período, com citações conferidas | ⏳ planejada | – | LLM local ou pago (indicação de 2026-11-24: Claude pela API da Anthropic atrás de uma porta trocável, recebendo só os trechos encontrados; Langfuse auto-hospedado só se o OpenTelemetry não bastar para acompanhar prompts e respostas; OpenRouter só como mais um adaptador da porta, nunca a base; qualquer fornecedor externo exige ADR sobre envio de dados de terceiros) |

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
| 2026-11-24 | S5 iniciada como feature `006`. Decisões: base legal por consentimento declarado por grupo (fecha a OQ-01), verificação de posse pelo código do `whatsapp:link` mandado ao agente (a conta da S2 volta a pendente), comandos por palavras fixas no núcleo do agente, exclusão em duas etapas com aviso ao dono, auditoria sem conteúdo e filtro por grupo na pergunta. 24 ações, acima das ~15 da regra, mantidas numa fatia só. |
| 2026-11-24 | S5 entregue e demonstrada com o chip real (PR #14), seguindo o roteiro do `onboarding.md` da 006: verificação da conta pelo código do `whatsapp:link`, listar, acompanhar com o consentimento confirmado, perguntar citando o nome do grupo, parar e apagar um grupo descartável, com auditoria. A demonstração não mostrou nenhum problema. |
| 2026-11-24 | S6 iniciada como feature `007`. Decisões: o sentido é calculado no computador (Text Embeddings Inference em CPU, porque a imagem do Ollama tem 3,4 GB) atrás de uma porta trocável por um serviço online (Voyage, indicada pela Anthropic, ou OpenAI) só com liberação explícita; busca combinada de palavra, palavra parecida e sentido, com o "não encontrei" decidido por limiares de cada forma; Jev como verificador opcional e desligado; Langfuse e OpenRouter adiados para a S9. 23 ações, acima das ~15 da regra, mantidas numa fatia só a pedido do usuário. |
| 2026-11-25 | S6 entregue e demonstrada pelo WhatsApp (PR #16): o histórico de 3.638 trechos ganhou o sentido calculado no computador com o `multilingual-e5-base` (τ 0,86, escolhido pela medição com 27 perguntas reais do T3, ADR-0012), e o Jev foi testado com perguntas reais depois do ADR-0013 (só a pergunta, o texto e o autor por apelido saem da máquina, e só em testes do dono). A demonstração expôs quatro problemas: a varredura do histórico parava em silêncio porque o lote de 32 trechos passava do prazo (corrigido com um prazo próprio de 120 s e um aviso em log); o adaptador do Jev mandava autor, conversa e data (corrigido pelo ADR-0013); faltavam métricas do que o Jev decidiu (entraram `verifier_calls_total` e `verifier_candidates_total`); e o Jev recusou a resposta certa de "Mas não tem tomador sendo afetado pelo sicob?" com nota 0,51, abaixo do mínimo de 0,7 (o `.env` do dono passou a 0,5, de forma provisória). Ficam para depois: calibrar o mínimo do Jev com perguntas reais ou mudar o papel dele para só reordenar; o prazo de 1,5 s do sentido da pergunta, que às vezes estoura com a máquina apertada de memória; e o Recall@10 real de 0,68, abaixo dos 90% que o ADR-0012 pede para considerar a reordenação local. A falha dos áudios longos (prazo de 300 s do `fetch` do Node) é um defeito da S4 e vai num PR separado. |
| 2026-11-25 | Correção da S4 (PR #18, bugs #7 e #8 de `_reversa_bugs/transcricao-de-audios`): 36 áudios do T3 estavam `failed` como "motor indisponível". Dois defeitos no prazo da chamada ao motor: o `fetch` do Node cortava aos 300 s as transcrições mais longas (agora o adaptador usa um transporte próprio sobre `node:http`, sem esse limite), e, para durações decimais, o prazo saía não inteiro e o `AbortSignal.timeout` recusava a chamada antes de ela sair (agora arredondado para cima). Os 36 voltaram à fila e os 160 áudios do T3 estão transcritos. |
| 2026-11-25 | S7 iniciada como feature `008`. Decisões: "mostra a N" por palavras fixas, sem LLM, válido por 2 h; as citações ficam no estado curto da S5, só com ids; a mensagem citada inteira com 3 vizinhas de cada lado; para áudio, a transcrição completa com o trecho marcado e o arquivo, por referência no contrato do canal 1.4.0, lido do armazenamento cifrado só para o dono e enviado pelo WhatsApp como mensagem de voz. 17 ações, um pouco acima das ~15 da regra, mantidas numa fatia só. |
