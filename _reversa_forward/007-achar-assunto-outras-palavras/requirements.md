# Requirements: Achar o mesmo assunto dito com outras palavras (fatia S6)

> Identificador: `007-achar-assunto-outras-palavras`
> Data: `2026-11-24`
> Pasta da extração reversa: `_reversa_sdd/` (greenfield: `prd.md`, specs em `sdd/` e adendos 001 a 006, mais os de bug)
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

O usuário pergunta com as palavras dele e encontra a mensagem mesmo quando quem escreveu usou outras. Por exemplo, "quem falou de baratear a infraestrutura?" deve achar "o Karpenter reduziu em 30% o custo do nosso cluster". Isso vale para mensagens de texto e para trechos de áudio transcritos, importados ou ao vivo. A busca por palavra exata continua acertando o que já acerta. O "não encontrei" continua valendo quando nada sustenta a resposta.

Hoje a busca só encontra mensagens que contêm as palavras da pergunta (S0). Pergunta feita com sinônimo, paráfrase ou erro de digitação volta "não encontrei", mesmo com a resposta na base. Esta fatia completa a busca híbrida prevista nas specs. O ganho precisa aparecer em números no `npm run eval`.

O sentido é calculado no computador do usuário por padrão. Trocar por um serviço online é só configuração. Um verificador externo opcional (o Jev, da TypeSafe) pode reordenar as candidatas e decidir o "não encontrei". Ele fica desligado por padrão e entra na medição. A resposta ao usuário continua sem LLM até a S9.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/prd.md#4. Escopo (in)` | Busca híbrida: palavra exata, aproximada e por assunto, com filtro do espaço antes da busca | 🟡 |
| `_reversa_sdd/prd.md#3. Métricas de sucesso` | ≥ 85% de acertos em ≥ 30 perguntas com resposta conhecida; 100% das afirmações com a mensagem de origem; meta do "não encontrei" ainda `[INDEFINIDO]` | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#6. Requisitos Funcionais` | RF-02 índice de trigramas (erro de digitação); RF-03 embedding por trecho; RF-04 modelo e dimensão registrados em cada trecho, troca de modelo marca para reindexar; RF-08 reconstrução do índice | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#6.3 Fluxos Alternativos` | Fluxo B: troca de modelo reindexa em segundo plano e só troca o índice ativo ao concluir | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#7. Requisitos Não-Funcionais` | RNF-01 P95 ≤ 60 s da gravação ao índice; RNF-02 embeddings locais por padrão, provedor pago só por configuração | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#11. Edge Cases e Tratamento de Erros` | EC-01 falha do gerador: índices textuais gravados e trechos pendentes para nova tentativa; EC-05 dimensão divergente recusada | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#14. Open Questions` | OQ-01 qual modelo multilíngue local atende o pt-BR com qualidade suficiente | 🟡 |
| `_reversa_sdd/sdd/retrieval.md#6. Requisitos Funcionais` | RF-02 três estratégias em paralelo (top 50 cada); RF-03 fusão por posição (RRF, k=60), determinística; RF-08 `low_confidence`; RF-09 modo `degraded` sem o gerador | 🟡 |
| `_reversa_sdd/sdd/retrieval.md#7. Requisitos Não-Funcionais` | RNF-01 P95 < 800 ms com 100.000 mensagens; RNF-03 trace com o tempo de cada estratégia | 🟡 |
| `_reversa_sdd/sdd/retrieval.md#14. Open Questions` | OQ-01 limiar de `low_confidence`; OQ-02 reordenação local se o Recall@10 ficar abaixo de 90% | 🟡 |
| `_reversa_sdd/addenda/001-walking-skeleton.md#Impacto por artefato da extração` | Um trecho por mensagem com índice textual em português. O score é a fração dos termos presentes, com limiar 0,5. A fusão de três estratégias ficou para a busca híbrida. Embeddings e reconstrução pendentes | 🟢 |
| `_reversa_sdd/addenda/005-perguntar-sobre-audios.md#Impacto por artefato da extração` | Transcrição indexada em blocos de ~400 caracteres com a faixa do áudio; filtro por tipo `audio` nas portas internas (E001) | 🟢 |
| `_reversa_sdd/addenda/006-gerenciar-grupos-pelo-agente.md#Impacto por artefato da extração` | Filtro por fonte (`sourceIds`) dentro da query; fonte `deleting` fora dos resultados; exclusão apaga os trechos em cascata | 🟢 |
| `docs/plano-de-fatias.md#Status` | S6: achar mensagens do mesmo assunto ditas com outras palavras, com o `npm run eval` mostrando a melhora; pendência: modelo local escolhido por medição | 🟢 |

Estado medido em 2026-11-24, só com contagens:
- **Base do usuário:** 3.391 mensagens em 5 fontes, com 3.247 trechos indexados. Há 154 áudios do T3 na fila de transcrição.
- **Conjunto de avaliação (`eval/cases.json`):** é sintético, com 20 mensagens e 32 perguntas (24 com resposta e 8 sem). Todas as perguntas com resposta usam as mesmas palavras da mensagem esperada; nenhuma testa sinônimo ou paráfrase.
- **Última medição:** 96,9% de acertos, 100% de citação e 87,5% de "não encontrei" correto. O único erro foi a pergunta n07, que respondeu quando não devia.
- **Máquina do usuário:** CPU sem placa de vídeo dedicada e 31 GB de memória. O transcritor já ocupa até 4 GB.

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| P1, Profissional conectado (`_reversa_sdd/personas.md#Persona 1: Profissional conectado`) | Reencontrar uma recomendação sem lembrar as palavras exatas | Pergunta "quem sugeriu algo para orquestrar processos demorados?" e recebe a mensagem de Diego sobre o Temporal ("workflows de longa duração"), com autor, conversa e data |
| P1, sobre áudios | Achar o áudio em que o assunto foi explicado com outras palavras | Pergunta "em qual áudio falaram de cortar gastos?" e recebe o áudio em que alguém disse "reduzir o custo", com o ponto do trecho |
| P2, Gestor ou consultor (`_reversa_sdd/personas.md#Persona 2: Gestor ou consultor com pouco tempo`) | Perguntar rápido, com erro de digitação, pelo celular | Digita "kubernets" ou "karpentr" e acha as mensagens sobre Kubernetes e Karpenter |
| Operador (hoje, o próprio usuário) | Escolher o modelo com números e ver se a busca melhorou | Roda a medição dos modelos na própria máquina, escolhe um, roda o `npm run eval` e compara o antes e o depois por tipo de pergunta |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** Toda mensagem com texto, legenda ou transcrição passa a ser encontrável pelo sentido, além das palavras. Isso inclui o histórico já guardado. A evidência citada continua sendo a mensagem original, nunca uma representação derivada dela. 🟡
   - Origem: `_reversa_sdd/sdd/knowledge-indexing.md#3. Goals (Objetivos)` (G-01); princípio "Evidence over hallucination" (`CLAUDE.md`)
   - Tipo: nova
2. **RN-02:** O isolamento continua antes da busca. Cada forma de busca (palavra, palavra aproximada e sentido) aplica o filtro do espaço, das fontes pedidas, do tipo de mensagem e das fontes em exclusão dentro da própria consulta. Nenhuma combina resultados de outro espaço para filtrar depois. 🟢
   - Origem: `_reversa_sdd/sdd/retrieval.md#6. Requisitos Funcionais` (RF-01); `_reversa_sdd/addenda/006-gerenciar-grupos-pelo-agente.md` (filtro por fonte e `deleting`)
   - Tipo: alterada (passa a valer para as novas formas de busca)
3. **RN-03:** A busca por palavra exata não piora. Toda pergunta do conjunto de avaliação que acerta hoje continua acertando, e a mensagem que contém os termos da pergunta continua entre as citadas. 🟡
   - Origem: `_reversa_sdd/addenda/001-walking-skeleton.md` (busca textual atual); `docs/plano-de-fatias.md` (o eval mostra a melhora)
   - Tipo: nova
4. **RN-04:** Semelhança fraca não vira resposta. Quando nenhuma mensagem sustenta a pergunta, o agente responde "não encontrei evidências suficientes", também nas perguntas que só a busca por sentido alcançaria. A meta é ≥ 90% de "não encontrei" correto nas perguntas sem evidência do conjunto de avaliação. O corte é ajustado pela medição, junto com o acerto nas paráfrases. 🟢
   - Origem: `_reversa_sdd/sdd/retrieval.md#6. Requisitos Funcionais` (RF-08); `_reversa_sdd/prd.md#9. Critérios de aceite (alto nível)` (Evidência) e `#3. Métricas de sucesso` (meta `[INDEFINIDO]`, decidida no esclarecimento de 2026-11-24)
   - Tipo: alterada (o limiar atual, a fração de termos presentes, não serve para resultados sem os termos da pergunta)
5. **RN-05:** O conteúdo não sai da máquina por padrão. O sentido das mensagens é calculado localmente. O mecanismo que calcula o sentido é substituível: trocar o cálculo local por um serviço online é configuração, sem mudar o núcleo, a busca nem o formato da resposta. Um serviço online só entra por escolha explícita do operador, como na transcrição da S4. Ao ligá-lo, todas as mensagens indexadas e as perguntas passam a ir para o fornecedor, e por isso a escolha precisa de uma decisão registrada (ADR) sobre o envio de dados de terceiros. 🟢
   - Origem: `_reversa_sdd/sdd/knowledge-indexing.md#7. Requisitos Não-Funcionais` (RNF-02) e `#12. Segurança e Privacidade`; `_reversa_sdd/addenda/005-perguntar-sobre-audios.md` (motor remoto só com opção explícita); esclarecimento de 2026-11-24 (substituível por online)
   - Tipo: nova
6. **RN-06:** O modelo padrão é escolhido por medição na máquina do usuário. A medição avalia a qualidade em português (achar a mensagem certa por paráfrase), a velocidade e a memória, e o usuário decide com os números, como na S4. Ela usa dois conjuntos de perguntas:
   - o conjunto sintético versionado, ampliado com paráfrases;
   - 15 a 20 perguntas reais do usuário sobre o T3, com as mensagens esperadas marcadas. Elas ficam só em `exports/`, fora do git, e aparecem só como números.

   A medição pode incluir um serviço online para comparação, se o operador o configurar. Trocar de modelo é configuração e não exige mudar o núcleo. 🟢
   - Origem: `_reversa_sdd/sdd/knowledge-indexing.md#14. Open Questions` (OQ-01) e `#8. Design e Interface` (gerador trocável); `docs/plano-de-fatias.md` (pendência da S6); `_reversa_sdd/addenda/005-perguntar-sobre-audios.md` (medição com dados reais em `exports/`); esclarecimento de 2026-11-24
   - Tipo: nova
7. **RN-07:** Se o cálculo de sentido ficar indisponível, nada para. Mensagens continuam sendo guardadas e indexadas por palavra, e o sentido delas é calculado depois. A busca responde só por palavra e registra que está degradada. 🟡
   - Origem: `_reversa_sdd/sdd/retrieval.md#6. Requisitos Funcionais` (RF-09); `_reversa_sdd/sdd/knowledge-indexing.md#11. Edge Cases e Tratamento de Erros` (EC-01)
   - Tipo: nova
8. **RN-08:** A representação de sentido é dado derivado de conteúdo privado. Ela é apagada junto com a fonte (S5), nunca vai para logs, métricas ou relatórios, e cada trecho registra o modelo que a gerou. Um trecho de modelo diferente do ativo não entra na busca por sentido. 🟡
   - Origem: `_reversa_sdd/sdd/knowledge-indexing.md#6. Requisitos Funcionais` (RF-04, RF-09) e `#11` (EC-05); `_reversa_sdd/addenda/006-gerenciar-grupos-pelo-agente.md` (exclusão em cascata)
   - Tipo: nova
9. **RN-09:** Um verificador externo opcional pode julgar as candidatas que a busca já trouxe. Ele dá a probabilidade de cada uma sustentar a resposta à pergunta, para reordenar e decidir o "não encontrei". Ele não encontra mensagens sozinho e não escreve texto. Fica desligado por padrão e só liga por configuração explícita. Quando ligado, a pergunta e o texto das candidatas (até 30 por pergunta) vão para o fornecedor. Indisponível ou lento, a resposta segue sem ele e registra o modo degradado. 🟡
   - Origem: `_reversa_sdd/sdd/retrieval.md#14. Open Questions` (OQ-02, reordenação se o Recall@10 ficar abaixo de 90%); esclarecimento de 2026-11-24 (Jev, da TypeSafe, como opção medida)
   - Tipo: nova
10. **RN-10:** A mensagem achada só pelo sentido é citada igual às outras, com autor, conversa, data e trecho, sem aviso e sem ordem separada. 🟢
    - Origem: esclarecimento de 2026-11-24; formato de citação das S1 a S5
    - Tipo: nova

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | Calcular e guardar a representação de sentido de cada trecho indexado (texto, legenda e bloco de transcrição), com o modelo e a dimensão registrados no trecho | Must | Depois de indexar uma mensagem, todos os trechos dela têm representação de sentido do modelo ativo. Gravar com dimensão diferente da configurada é recusado com erro de configuração | 🟡 |
| RF-02 | Buscar por sentido dentro do espaço, com os mesmos filtros de fonte, tipo e fonte em exclusão da busca por palavra | Must | "Quem sugeriu algo para orquestrar processos demorados?" acha a mensagem sobre o Temporal ("workflows de longa duração"). Dois espaços com o mesmo conteúdo nunca cruzam resultados | 🟡 |
| RF-03 | Combinar a busca por palavra, por palavra aproximada e por sentido num só ranking, determinístico para a mesma pergunta e o mesmo índice, com a mensagem aparecendo uma vez com o melhor trecho | Must | A mesma pergunta duas vezes devolve as mesmas citações na mesma ordem. Uma mensagem achada pelas três formas aparece uma vez só | 🟡 |
| RF-04 | Encontrar palavras com erro de digitação | Should | "kubernets" e "karpentr" acham as mensagens sobre Kubernetes e Karpenter | 🟡 |
| RF-05 | Decidir o "não encontrei" com um limiar que vale também para os resultados achados só pelo sentido | Must | ≥ 90% de "não encontrei" correto nas perguntas sem evidência do conjunto de avaliação, inclusive as novas, sem que os acertos totais caiam abaixo de 85% | 🟢 |
| RF-06 | Calcular o sentido do histórico já guardado em segundo plano, sem atrasar a indexação das mensagens novas, com o progresso visível | Must | Depois da subida, as 3.391 mensagens atuais ficam encontráveis por sentido sem reimportar nada. Uma mensagem ao vivo chegada durante esse processo é indexada no prazo normal | 🟡 |
| RF-07 | Quando o cálculo de sentido estiver indisponível, indexar por palavra, deixar o sentido pendente para nova tentativa e responder em modo degradado | Must | Com o cálculo desligado, uma mensagem nova é encontrada por palavra. Ao religar, ela passa a ser encontrada por sentido sem ação manual. A busca nesse intervalo registra `degraded` | 🟡 |
| RF-08 | Medir os modelos candidatos na máquina do usuário (qualidade em paráfrases em português, velocidade e memória) com o conjunto sintético e com as perguntas reais do T3 em `exports/`, mostrando só números | Must | A medição gera uma tabela por modelo e por conjunto com acerto, tempo por mensagem e memória, sem mostrar conteúdo de mensagens nem das perguntas reais. Um serviço online configurado entra na mesma tabela. O modelo escolhido vira o padrão por configuração | 🟢 |
| RF-09 | Ampliar o conjunto de avaliação com perguntas de paráfrase, sinônimo e erro de digitação, com e sem evidência, e mostrar no `npm run eval` o resultado por tipo de pergunta e o antes e o depois | Must | O `npm run eval` mostra os acertos separados por tipo (palavra exata, paráfrase, erro de digitação, sem evidência) e compara a busca só por palavra, a busca combinada e, se configurado, a busca combinada com o verificador externo | 🟢 |
| RF-10 | Trocar o modelo ativo recalculando o sentido em segundo plano. A busca continua com o modelo anterior até a troca terminar | Should | Durante a troca, a busca responde com o modelo antigo. Ao concluir, passa para o novo, e os trechos do modelo antigo deixam de entrar na busca por sentido | 🟡 |
| RF-11 | Mostrar a indexação por sentido no painel e nos traces: pendentes, velocidade, falhas, tempo de cada forma de busca e taxa de modo degradado | Should | O painel mostra os pendentes caindo durante o cálculo do histórico. O trace de uma pergunta mostra o tempo de cada forma de busca | 🟡 |
| RF-12 | Responder e citar como hoje, qualquer que seja a forma de busca que achou a mensagem, sem aviso nem ordem separada para o resultado achado só pelo sentido | Must | A citação de uma mensagem achada por sentido tem autor, conversa, data e trecho (e duração e ponto, se for áudio), no formato das S1 a S5 | 🟢 |
| RF-13 | Calcular o sentido atrás de uma porta substituível, com uma implementação local (padrão) e uma implementação para serviço online, escolhidas por configuração | Must | Trocar a configuração de local para online (e de volta) não muda código do núcleo nem da busca. O serviço online só é usado com a opção explícita ligada, e a subida avisa quando ela está ligada. Trocar de implementação segue a troca de modelo (RF-10) | 🟢 |
| RF-14 | Verificar as candidatas com um serviço externo opcional, desligado por padrão, que reordena e decide o "não encontrei" | Should | Desligado, a resposta é idêntica à da busca combinada. Ligado, o `npm run eval` mostra o efeito dele por tipo de pergunta. Com o serviço fora do ar ou acima do tempo-limite, a resposta sai sem ele e registra `degraded` | 🟡 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Desempenho | Mensagem de texto ao vivo encontrável por sentido em P95 ≤ 60 s depois de gravada | `_reversa_sdd/sdd/knowledge-indexing.md#7. Requisitos Não-Funcionais` (RNF-01) | 🟡 |
| Desempenho | Busca combinada com P95 < 800 ms para 100.000 mensagens, com o cálculo do sentido da pergunta incluído | `_reversa_sdd/sdd/retrieval.md#7. Requisitos Não-Funcionais` (RNF-01) | 🟡 |
| Desempenho | Histórico atual (3.391 mensagens) com o sentido calculado em até 1 h na máquina do usuário. Para 100.000 mensagens, o alvo é ≤ 2 h, a confirmar na medição | `_reversa_sdd/sdd/knowledge-indexing.md#3. Goals (Objetivos)` (métrica de reindexação); estado medido em 2026-11-24 | 🟡 |
| Recursos | O cálculo de sentido cabe na máquina do usuário junto com o transcritor, sem passar de 2 GB de memória adicional | Estado medido em 2026-11-24 (CPU sem placa de vídeo, 31 GB, transcritor com até 4 GB) | 🟡 |
| Qualidade | O conjunto ampliado tem ao menos 30 perguntas com resposta conhecida, com ≥ 85% de acertos no total e nenhuma regressão nas perguntas por palavra exata | `_reversa_sdd/prd.md#3. Métricas de sucesso`; RN-03 | 🟡 |
| Segurança | Nenhum texto de mensagem, pergunta ou representação de sentido em logs, métricas ou relatórios. A medição e o eval mostram só números e identificadores | `_reversa_sdd/sdd/retrieval.md#12. Segurança e Privacidade` (logs com hash da consulta); regra do projeto sobre dados de terceiros | 🟢 |
| Privacidade | Cálculo local por padrão. Serviço online e verificador externo só com opção explícita, cada um com a sua, e a subida avisa quando estiverem ligados. Ligar um deles exige o ADR sobre envio de dados de terceiros | RN-05, RN-09 | 🟢 |
| Desempenho | Com o verificador externo ligado, a resposta continua com P95 ≤ 3 s. Acima do tempo-limite, a resposta sai sem ele | RN-09; tempo de resposta compatível com uma conversa (`_reversa_sdd/sdd/retrieval.md#3. Goals (Objetivos)`, G-03) | 🟡 |
| Observabilidade | Trace por pergunta com o tempo de cada forma de busca, e contadores de modo degradado e de pendentes | `_reversa_sdd/sdd/retrieval.md#7. Requisitos Não-Funcionais` (RNF-03) | 🟡 |
| Arquitetura | O cálculo de sentido e o verificador ficam atrás de portas trocáveis, isoladas como o transcritor, e o núcleo não conhece o motor nem o fornecedor | `_reversa_sdd/sdd/knowledge-indexing.md#8. Design e Interface`; regras de arquitetura do projeto | 🟢 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Paráfrase acha a mensagem certa
  Dado a mensagem de Diego "Recomendo o Temporal para orquestrar workflows de longa duração" indexada
  Quando o usuário pergunta "quem sugeriu algo para coordenar processos demorados?"
  Então o agente responde citando Diego, a conversa e a data

Cenário: Áudio achado por outras palavras
  Dado um áudio transcrito em que alguém diz "precisamos reduzir o custo do cluster"
  Quando o usuário pergunta "em qual áudio falaram de cortar gastos?"
  Então o agente cita esse áudio com a duração e o ponto do trecho

Cenário: Erro de digitação
  Dado a mensagem sobre o Karpenter indexada
  Quando o usuário pergunta "o que disseram do karpentr?"
  Então o agente cita a mensagem sobre o Karpenter

Cenário: Palavra exata não piora
  Dado o conjunto de avaliação da S0
  Quando o npm run eval roda com a busca combinada
  Então toda pergunta por palavra exata que acertava antes continua acertando

Cenário: Assunto ausente continua sem resposta
  Dado uma base sem nenhuma mensagem sobre Kafka nem sobre filas de mensagens
  Quando o usuário pergunta "alguém usou um sistema de mensageria distribuída?"
  Então o agente responde "não encontrei evidências suficientes"

Cenário: Isolamento na busca por sentido
  Dado dois espaços com mensagens de mesmo sentido
  Quando o usuário de um espaço pergunta por paráfrase
  Então nenhuma evidência do outro espaço é recuperada

Cenário: Filtro por grupo e por áudio continuam valendo
  Dado mensagens de mesmo sentido no T3 e em outra conversa
  Quando o usuário pergunta "em qual áudio do T3 falaram de cortar gastos?"
  Então só áudios do T3 são citados

Cenário: Cálculo de sentido indisponível
  Dado o cálculo de sentido desligado
  Quando chega uma mensagem nova e o usuário pergunta com as palavras dela
  Então o agente responde por palavra e a busca registra modo degradado
  E ao religar o cálculo, a mensagem passa a ser achada por paráfrase sem ação manual

Cenário: Histórico atual ganha busca por sentido
  Dado as conversas importadas e capturadas antes da S6
  Quando a S6 sobe e o cálculo do histórico termina
  Então perguntas por paráfrase sobre essas conversas são respondidas sem reimportar nada

Cenário: Fonte apagada some também da busca por sentido
  Dado uma conversa apagada pela S5
  Quando o usuário pergunta por paráfrase sobre o conteúdo dela
  Então nenhum trecho dela é citado

Cenário: Escolha do modelo por números
  Dado os modelos candidatos baixados
  Quando o operador roda a medição
  Então vê, para cada modelo e para cada conjunto (sintético e perguntas reais do T3), o acerto em paráfrases, o tempo por mensagem e a memória, sem conteúdo de mensagens nem das perguntas reais

Cenário: Mensagem achada só pelo sentido é citada como as outras
  Dado uma pergunta por paráfrase sem nenhuma palavra da mensagem esperada
  Quando o agente responde
  Então a mensagem aparece citada com autor, conversa, data e trecho, sem aviso nem ordem separada

Cenário: Trocar o cálculo local por um serviço online
  Dado o cálculo de sentido local ativo
  Quando o operador configura o serviço online e liga a opção explícita
  Então o sentido passa a ser recalculado pelo serviço em segundo plano, sem mudar código
  E a busca continua com o modelo local até o recálculo terminar

Cenário: Serviço online configurado sem a opção explícita
  Dado o serviço online configurado e a opção explícita desligada
  Quando o sistema sobe
  Então nenhuma mensagem é enviada ao serviço e a subida avisa o motivo

Cenário: Verificador externo ligado
  Dado o verificador externo ligado
  Quando o usuário pergunta sobre um assunto ausente da base
  Então o agente responde "não encontrei evidências suficientes"
  E o npm run eval mostra o efeito do verificador separado por tipo de pergunta

Cenário: Verificador externo fora do ar
  Dado o verificador externo ligado e indisponível
  Quando o usuário pergunta
  Então a resposta sai da busca combinada e a busca registra modo degradado

Cenário: Troca de modelo sem interromper a busca
  Dado o modelo A ativo e o modelo B configurado
  Quando o recálculo com B está em andamento
  Então a busca continua respondendo com A
  E ao terminar passa a usar B, sem misturar os dois na busca por sentido
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|---------------|
| RF-01, RF-02, RF-03 | Must | São a busca por sentido e a combinação, o objetivo da fatia |
| RF-05 | Must | Sem o limiar, a busca por sentido sempre acha "algo" e o agente passa a inventar (RN-04) |
| RF-06 | Must | O histórico do usuário já está guardado; sem o cálculo dele, a demonstração não mostra nada |
| RF-07 | Must | O índice nunca pode parar a captura nem a resposta (RN-07) |
| RF-08, RF-09 | Must | O plano exige que o eval mostre a melhora, e o modelo sai da medição (RN-06) |
| RF-12 | Must | A citação é o contrato com o usuário (Evidence over hallucination) |
| RF-13 | Must | Pedido do usuário: trocar por um serviço online precisa ser fácil |
| RF-14 | Should | A medição decide se o verificador vale a pena; a fatia se sustenta sem ele |
| RF-04 | Should | Ganho barato e previsto na spec, mas a fatia se sustenta sem ele |
| RF-10 | Should | A primeira subida não precisa de troca; ela vale quando houver um modelo melhor |
| RF-11 | Should | Observabilidade da fatia, como nas S4 e S5 |
| Reordenação dos resultados por um segundo modelo | Won't (S6) | Só se a medição mostrar Recall@10 abaixo de 90% (`retrieval.md#14`, OQ-02) |
| "Guardar com tema" e resumos | Won't (S6) | São as S8 e S9 |
| Respostas em linguagem natural | Won't (S6) | S9; a resposta continua montada a partir das evidências (ADR-0007) |

## 9. Esclarecimentos

### Sessão 2026-11-24

- **Q:** Onde é calculado o sentido das mensagens: no computador do usuário, num serviço externo, ou local por padrão com o externo disponível por configuração?
  **R:** c) Local por padrão; o serviço externo entra na medição e fica disponível só por configuração explícita. O usuário acrescentou que o mecanismo precisa ser facilmente substituível por um online, se assim quiserem (RN-05, RF-13). Contexto: a Anthropic não oferece modelo de embeddings e indica a Voyage AI; a OpenAI tem embeddings próprios.
- **Q:** Entra algum modelo externo na S6, além da busca?
  **R:** b) O Jev, da TypeSafe, como verificador opcional: reordena as candidatas e decide o "não encontrei", desligado por padrão, ligado só por configuração explícita e medido no eval contra a busca local sozinha (RN-09, RF-14). O Claude fica para a S9. Contexto: o Jev só julga candidatas, roda só na nuvem e não documenta suporte ao português.
- **Q:** Com quais perguntas medimos a melhora e escolhemos o modelo?
  **R:** b) O conjunto sintético ampliado mais 15 a 20 perguntas reais do usuário sobre o T3, guardadas só em `exports/` e mostradas só como números (RN-06, RF-08).
- **Q:** Como aparece a mensagem achada só pelo sentido?
  **R:** a) Citada igual às outras (RN-10, RF-12).
- **Q:** Qual a meta de "não encontrei" correto nas perguntas sem evidência?
  **R:** b) ≥ 90%, com o corte ajustado pela medição (RN-04, RF-05).

## 10. Lacunas

- 🟡 Premissa: uma mensagem continua sendo um trecho (o texto inteiro, até o limite da S0), e só a transcrição é dividida em blocos (S4). A divisão em trechos de 512 tokens da spec (`knowledge-indexing.md#6`, RF-03) fica para quando aparecerem mensagens longas o bastante.
- 🟡 Premissa: a busca por erro de digitação (RF-04) e o verificador externo (RF-14) entram como Should e podem sair da fatia se ela passar de ~15 ações.
- 🟡 Pendência fora do código: ligar o serviço online ou o verificador externo com dados reais exige o ADR sobre envio de dados de terceiros (RN-05). Até lá, o verificador só é medido com o conjunto sintético. As perguntas reais do T3 só entram na medição dele se o usuário decidir isso no ADR.
- 🟡 Pendência de medição: o Jev não documenta suporte ao português; o eval mostra se ele serve.

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-24 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-11-24 | Esclarecimentos (`/reversa-clarify`): cálculo local substituível por online, Jev como verificador opcional, medição com perguntas reais do T3, citação igual e meta de 90% no "não encontrei" | reversa |
