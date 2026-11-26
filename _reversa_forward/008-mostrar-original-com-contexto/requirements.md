# Requirements: Ver a mensagem original com contexto (fatia S7)

> Identificador: `008-mostrar-original-com-contexto`
> Data: `2026-11-25`
> Pasta da extração reversa: `_reversa_sdd/` (greenfield: `prd.md`, specs em `sdd/` e adendos 001 a 007, mais os de bug)
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

Hoje a resposta do agente lista até 3 mensagens, cada uma reduzida a um trecho de 280 caracteres. Para conferir o que foi dito, o dono precisa abrir o WhatsApp e rolar a conversa até achar. Com esta fatia, depois de uma resposta, ele manda "mostra a 2" e recebe a mensagem da citação 2:
- inteira, com quem escreveu, a conversa, a data e a hora;
- com as mensagens vizinhas da mesma conversa;
- se for áudio, com a transcrição completa e o ponto citado marcado.

Isso fecha o item "recuperar a mensagem original" do PRD e o critério de aceite P1 ("acesso à mensagem original").

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/prd.md#4. Escopo (in)` | "Recuperar a mensagem original ou o trecho de áudio citado em uma resposta" | 🟡 |
| `_reversa_sdd/prd.md#9. Critérios de aceite (alto nível)` | P1: resposta com autor, grupo, data "e acesso à mensagem original" | 🟡 |
| `_reversa_sdd/sdd/conversational-agent.md#6.1 Requisitos Principais` | RF-06: "mostra a 2" devolve o texto, o contexto vizinho e o link temporário do áudio. RF-09: a sessão guarda as citações da última resposta e expira após 2 h sem interação | 🟡 |
| `_reversa_sdd/sdd/conversational-agent.md#11. Edge Cases e Tratamento de Erros` | EC-05: "mostra a 3" sem resposta anterior informa que não há citações recentes | 🟡 |
| `_reversa_sdd/sdd/retrieval.md#6. Requisitos Funcionais` | RF-07: busca por contexto, que devolve as K mensagens anteriores e posteriores da mesma fonte (exemplo com K=5) | 🟡 |
| `_reversa_sdd/sdd/retrieval.md#11. Edge Cases e Tratamento de Erros` | EC-05: fonte em exclusão sai dos resultados na hora | 🟡 |
| `_reversa_sdd/sdd/media-transcription.md#6. Requisitos Funcionais` | RF-09: URL temporária de 15 min para o dono ouvir o áudio | 🟡 |
| `_reversa_sdd/addenda/005-perguntar-sobre-audios.md#Impacto por artefato da extração` | A resposta da S4 é só texto. A citação de áudio leva o tipo e a faixa do trecho (contrato 1.3.0). Devolver o arquivo ficou para a S7 por decisão de 2026-11-23 | 🟢 |
| `_reversa_forward/005-perguntar-sobre-audios/requirements.md` (RN-05, Won't) | A URL temporária ficou de fora porque o link local não abre no celular; "mostra a 2" com o áudio é a S7 | 🟢 |
| `_reversa_sdd/addenda/006-gerenciar-grupos-pelo-agente.md#Impacto por artefato da extração` | Comandos por palavras fixas no núcleo do agente, sem LLM. Estado curto em `agent_conversation_state` (lista por 30 min, ação pendente por 5 min). A lista numerada de grupos usa números próprios | 🟢 |
| `_reversa_sdd/addenda/003-perguntar-pelo-whatsapp.md#Impacto por artefato da extração` | Resposta pelo número do agente, só para o dono; texto longo é dividido em partes pelo adaptador | 🟢 |
| `_reversa_sdd/addenda/007-achar-assunto-outras-palavras.md#Impacto por artefato da extração` | Toda resposta cita até 3 mensagens, numeradas, com a mesma citação para palavra, palavra parecida e sentido | 🟢 |
| `_reversa_sdd/addenda/002-perguntar-historico-importado.md` e `bug-BUG-20261123-S57G-v001.md` | A legenda de mídia faz parte do texto da mensagem importada | 🟢 |

Componentes tocados: `agent` (comando novo e estado das citações), `retrieval` (busca por contexto), `media` (transcrição completa e leitura do arquivo cifrado), contrato do canal (anexo de mídia na resposta) e adaptador WhatsApp (envio do áudio).

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| P1, profissional conectado (o dono) | Conferir o que alguém disse de fato antes de usar a informação | Pergunta "quem recomendou o Temporal?", recebe 3 citações e manda "mostra a 1" para ler a mensagem inteira e o que veio antes e depois |
| P1, com áudio | Ouvir ou ler o áudio inteiro em que o assunto aparece | Pergunta "em qual áudio falaram do SLA?" e manda "mostra a 2" para ler a transcrição completa, com o ponto citado marcado |
| P2, gestor com pouco tempo | Entender a discussão sem abrir o grupo | Lê as mensagens vizinhas da citação para saber a quem a mensagem respondia |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** "mostra a N" se refere à citação N da **última resposta com citações** que o agente mandou ao dono naquele canal. Os números são os mesmos que apareceram na resposta. 🟡
   - Origem: `conversational-agent.md` RF-06 e RF-09
   - Tipo: nova
   - As citações guardadas valem por **2 horas** a partir da resposta. Depois disso, valem as regras da RN-07.
2. **RN-02:** O comando é reconhecido por palavras fixas, sem LLM, como os comandos da S5. Variações aceitas, sem acento nem maiúsculas: "mostra a N", "mostra N", "mostrar N", "ver N", "ver a N", "original N", com N de 1 a 3. Uma mensagem escrita dentro de um grupo nunca é comando. 🟢
   - Origem: `addenda/006` (comandos por palavras fixas)
   - Tipo: nova
3. **RN-03:** A mensagem é sempre buscada dentro do espaço do dono, pelo `messageId` guardado, nunca pelo texto. Fonte em exclusão ou apagada não é mostrada ("essa conversa foi apagada"). Fonte que deixou de ser acompanhada continua visível, como na busca. 🟢
   - Origem: `retrieval.md` EC-05; `addenda/006` (parar mantém o histórico)
   - Tipo: nova
4. **RN-04:** A mensagem citada vem **inteira**: texto completo, inclusive a legenda de mídia, com autor, conversa, data e hora. O corte de 280 caracteres vale só para a resposta da pergunta. 🟡
   - Tipo: nova
5. **RN-05:** O contexto vizinho são as mensagens anteriores e posteriores da **mesma conversa**, em ordem cronológica, com autor e hora. A mensagem citada fica destacada. Mensagens de sistema e apagadas não aparecem. São até **3 mensagens antes e 3 depois**; no começo ou no fim da conversa, vêm só as que existem. 🟢
   - Origem: `retrieval.md` RF-07
   - Tipo: nova
6. **RN-06:** Citação de áudio mostra a duração e a transcrição completa, com o trecho citado marcado, e em seguida manda **o próprio arquivo do áudio** para o dono ouvir no celular. Áudio sem transcrição (pendente, falho ou longo demais) mostra o estado em vez do texto e, se o arquivo estiver guardado, manda o arquivo mesmo assim. 🟢
   - Origem: `addenda/005` (o arquivo ficou para a S7); `media-transcription.md` RF-09, que previa uma URL temporária
   - Tipo: nova; substitui a URL temporária, que não abre no celular porque o armazenamento é local
   - O arquivo vai só pela conversa direta do dono com o agente, nunca para um grupo. Se o canal não manda mídia ou o arquivo não está guardado (por exemplo, áudio importado sem o arquivo no ZIP), a resposta diz isso e mantém o texto.
7. **RN-07:** Sem citações válidas (nenhuma resposta antes, validade vencida ou N maior que o número de citações), o agente explica o que aconteceu e o que fazer, sem buscar nada. 🟡
   - Origem: `conversational-agent.md` EC-05
   - Tipo: nova
8. **RN-08:** Nada do conteúdo mostrado vai para log, métrica ou trace. O estado guarda só os ids e a faixa do trecho, nunca o texto. 🟢
   - Origem: privacidade das S2 a S6
   - Tipo: nova

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | Ao responder com citações, o agente guarda, por dono e canal, a lista da última resposta: índice, `messageId`, tipo e faixa do trecho de áudio, com o momento. Uma resposta nova substitui a anterior; "não encontrei" não apaga a lista anterior | Must | Depois de uma resposta com 3 citações, o estado tem os 3 ids na ordem da resposta e nenhum texto | 🟡 |
| RF-02 | O agente reconhece as variações de "mostra a N" (RN-02) antes da busca, sem LLM | Must | "Mostra a 2", "ver 2" e "original 2" mostram a citação 2; "me mostra o que a Ana disse" continua sendo pergunta | 🟢 |
| RF-03 | A resposta traz a mensagem citada inteira, com autor, conversa, data e hora (RN-04) | Must | Uma mensagem de 900 caracteres aparece completa, dividida em partes pelo adaptador se passar do limite do canal | 🟡 |
| RF-04 | A busca por contexto devolve as mensagens vizinhas da mesma fonte e do mesmo espaço, em ordem, e a resposta as mostra com a citada destacada (RN-05) | Must | Para uma mensagem no meio da conversa, vêm as 3 anteriores e as 3 posteriores; na primeira mensagem da conversa, só as 3 posteriores | 🟢 |
| RF-05 | Para áudio, a resposta traz a duração, a transcrição completa e o trecho citado marcado (RN-06) | Must | "mostra a 1" de um áudio de 1:42 citado aos 0:37 mostra a transcrição inteira e marca o trecho de 0:37 | 🟡 |
| RF-06 | Para áudio, depois do texto, o agente manda o arquivo do áudio ao dono (RN-06). A resposta neutra (`AgentReply`) passa a aceitar um anexo de mídia, numa versão aditiva do contrato do canal; o adaptador do WhatsApp manda como mensagem de voz, e o canal de teste registra o anexo. O arquivo é lido do armazenamento cifrado do espaço do dono | Must | "mostra a 1" de um áudio guardado entrega o texto e o arquivo, com o mesmo conteúdo do original (mesmo hash); áudio sem arquivo guardado entrega só o texto com o aviso | 🟢 |
| RF-07 | Respostas para os casos sem mensagem: sem citações recentes (nenhuma resposta ou mais de 2 h), N fora do intervalo, conversa apagada, mensagem não encontrada (RN-03, RN-07) | Must | Cada caso tem a sua resposta, sem detalhe técnico, e nenhum chama a busca | 🟢 |
| RF-08 | A ajuda do agente ganha "mostra a N" | Should | "ajuda" lista o comando com um exemplo | 🟢 |
| RF-09 | Métricas sem conteúdo: pedidos de original pelo resultado (`shown`, `no_recent`, `out_of_range`, `deleted`, `not_found`) e áudios enviados ou não (`sent`, `missing_file`, `failed`) | Should | O painel mostra a contagem por resultado | 🟡 |
| RF-10 | O mesmo comportamento pelo canal de teste e pelo WhatsApp, pelo `AgentReply` neutro | Must | A suíte de contrato do canal cobre "mostra a N" nos dois adaptadores | 🟢 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Desempenho | P95 abaixo de 1 s do comando à resposta pronta, sem contar o envio pelo canal | Sem LLM nem cálculo de sentido: só leitura no banco por id e índice da fonte | 🟡 |
| Segurança | Espaço sempre derivado da conta verificada; a mensagem é lida pelo id guardado e filtrada pelo espaço; nada do texto do pedido escolhe a fonte | `conversational-agent.md` §12; `addenda/006` | 🟢 |
| Privacidade | Logs, métricas e traces sem conteúdo nem nomes; o estado guarda só ids e a faixa do trecho | Padrão das S2 a S6 | 🟢 |
| Observabilidade | Span e métrica do pedido de original, com o resultado | `platform-foundation` (painéis por fatia) | 🟡 |
| Arquitetura | O núcleo não conhece o canal; o anexo de áudio entra no contrato do canal de forma aditiva, com nova versão (1.4.0), e a suíte de contrato passa a cobrir o envio de mídia | ADR-0004; contrato 1.3.0 | 🟢 |
| Privacidade do áudio | O arquivo é decifrado só na memória do processo que envia, vai só para a conta verificada do dono e nunca é gravado decifrado em disco | ADR-0010 (mídia cifrada) | 🟢 |

## 7. Critérios de Aceitação

```gherkin
Cenário: ver a mensagem citada inteira, com as vizinhas
  Dado que o dono perguntou "quem recomendou o Temporal?" e recebeu 3 citações
  Quando ele manda "mostra a 2"
  Então recebe a mensagem da citação 2 inteira, com autor, conversa, data e hora
  E recebe as mensagens anteriores e posteriores da mesma conversa, com a citada destacada

Cenário: ver e ouvir o áudio citado
  Dado que a citação 1 da última resposta é um áudio de 1:42 citado aos 0:37, com o arquivo guardado
  Quando o dono manda "ver 1"
  Então recebe a duração e a transcrição completa, com o trecho de 0:37 marcado
  E em seguida recebe o arquivo do áudio, só na conversa direta com o agente

Cenário: áudio sem arquivo guardado
  Dado que a citação 1 é um áudio importado cujo arquivo não veio no ZIP
  Quando o dono manda "mostra a 1"
  Então recebe o texto disponível e o aviso de que o arquivo do áudio não está guardado

Cenário: citações vencidas
  Dado que a última resposta com citações foi há mais de 2 horas
  Quando o dono manda "mostra a 1"
  Então o agente diz que não há citações recentes e pede a pergunta de novo

Cenário: número fora da resposta
  Dado que a última resposta teve 2 citações
  Quando o dono manda "mostra a 3"
  Então o agente diz que a última resposta tem 2 citações e não busca nada

Cenário: sem resposta recente
  Dado que o dono não recebeu nenhuma resposta com citações dentro da validade
  Quando ele manda "mostra a 1"
  Então o agente diz que não há citações recentes e pede a pergunta de novo

Cenário: conversa apagada depois da resposta
  Dado que a citação 1 é de uma conversa que o dono apagou depois da resposta
  Quando ele manda "mostra a 1"
  Então o agente diz que essa conversa foi apagada e não mostra nada dela

Cenário: pergunta parecida com o comando
  Dado uma conta verificada
  Quando o dono manda "me mostra o que a Ana disse sobre o SLA"
  Então a mensagem é tratada como pergunta, não como comando

Cenário: uma resposta nova troca as citações; "não encontrei" não troca
  Dado que o dono recebeu uma resposta com 3 citações
  Quando ele faz uma pergunta que volta "não encontrei" e depois manda "mostra a 1"
  Então recebe a citação 1 da resposta com citações anterior
  E, depois de uma nova resposta com citações, "mostra a 1" passa a mostrar a citação 1 dela

Cenário: a ajuda ensina o comando
  Dado uma conta verificada
  Quando o dono manda "ajuda"
  Então a ajuda mostra "mostra a N" com um exemplo, igual pelo canal de teste e pelo WhatsApp
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|---------------|
| RF-01 a RF-05, RF-07, RF-10 | Must | São o "mostra a 2" do PRD e do critério de aceite P1 |
| RF-08, RF-09 | Should | Descoberta do comando e acompanhamento, sem bloquear a entrega |
| RF-06 (arquivo do áudio) | Must | Escolha do usuário em 2026-11-25: o arquivo do áudio ficou para esta fatia desde a S4 |
| RNF de desempenho | Should | Sem LLM, deve ser naturalmente rápido |

## 9. Esclarecimentos

### Sessão 2026-11-25

- **Q:** Quando a citação é um áudio, o que "mostra a N" devolve: só a transcrição, a transcrição e o arquivo, ou o arquivo só por um segundo comando?
  **R:** A transcrição completa com o trecho marcado e, em seguida, o arquivo do áudio. Aplicado na RN-06, na RF-06 (agora Must) e nos RNF de arquitetura e privacidade do áudio.
- **Q:** Quantas mensagens vizinhas mostrar antes e depois da citada?
  **R:** 3 de cada lado. Aplicado na RN-05 e na RF-04.
- **Q:** Por quanto tempo "mostra a N" vale depois da resposta?
  **R:** 2 horas. Aplicado na RN-01, na RF-07 e num cenário novo.

## 10. Lacunas

- 🟡 Fora desta fatia (premissas): pedir mais contexto ("mais"), navegar para trás e para a frente na conversa, mostrar fotos e documentos (só o áudio é guardado) e o histórico de 10 trocas do `conversational-agent` RF-09 (aqui só a última resposta com citações).
- 🟡 A forma exata do anexo no contrato (campos, limite de tamanho) e do envio pelo Baileys fica para o `/reversa-plan`.

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-25 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-11-25 | Sessão de esclarecimentos: áudio com arquivo, 3 vizinhas de cada lado, validade de 2 h | reversa-clarify |
