# Requirements: Walking skeleton da platform-foundation

> Identificador: `001-walking-skeleton`
> Data: `2026-11-22`
> Pasta da extração reversa: `_reversa_sdd/` (artefatos greenfield do `/reversa-new`, todos 🟡 PLANEJADO)
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

Primeira entrega do Palantír: a fundação de engenharia e um caminho ponta a ponta mínimo, sem WhatsApp real. Uma mensagem entra por um adaptador de canal fake, é gravada uma única vez, fica pesquisável e é recuperada por uma pergunta ao agente, que responde com citação da mensagem de origem ou com "não encontrei evidências suficientes". Tudo roda localmente com um comando, sob os gates de qualidade do projeto (TDD, pirâmide de testes, testes de arquitetura, complexidade ciclomática, segurança). Serve para desenvolvedores e agentes de IA que vão construir os componentes seguintes e para o operador que valida a tese.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/sdd/platform-foundation.md#6. Requisitos Funcionais` | Ambiente local com um comando, IaC, monólito modular, hooks, pirâmide de testes, E2E do walking skeleton, DoR como gate, observabilidade, API first, harness de avaliação | 🟡 |
| `_reversa_sdd/sdd/platform-foundation.md#7. Requisitos Não-Funcionais` | RNF-05 testes de arquitetura; RNF-06 complexidade ciclomática ≤ 10 | 🟡 |
| `_reversa_sdd/sdd/channel-contract.md#6. Requisitos Funcionais` | `KnowledgeChannel`, `CanonicalMessage` com `provider` livre e `captureMethod`, `AgentReply` neutro, suíte de contrato | 🟡 |
| `_reversa_sdd/sdd/ingestion.md#6. Requisitos Funcionais` | Rejeição de fonte não autorizada, deduplicação por `externalMessageId`, mensagem imutável, outbox | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#6. Requisitos Funcionais` | Índice textual por `space_id` | 🟡 |
| `_reversa_sdd/sdd/retrieval.md#6. Requisitos Funcionais` | Filtro obrigatório por `space_id`, `low_confidence` | 🟡 |
| `_reversa_sdd/sdd/conversational-agent.md#6. Requisitos Funcionais` | Resposta só com evidências, citações validadas, "não encontrei evidências suficientes", `AgentReply` neutro | 🟡 |
| `_reversa_sdd/sdd/identity-and-sources.md#6. Requisitos Funcionais` | `KnowledgeSpace` pessoal, fonte autorizada, resolução do usuário pela conta de canal | 🟡 |
| `_reversa_sdd/prd.md#4. Escopo (in)` | Engenharia conforme `requirements.md`; qualidade estrutural como RNF | 🟡 |
| `requirements.md` (raiz do projeto) | Documentation/API/Security/Local first, TDD, SOLID, Clean Arch, pirâmide de testes, pre-commit, IaC Terraform, observabilidade Grafana/Prometheus/Tempo/Loki, DoR | 🟢 |

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| Desenvolvedor ou agente de IA do projeto | Construir componentes sobre uma fundação com gates automáticos | Clona o repositório, sobe o ambiente com um comando, escreve teste, implementa e tem o commit validado pelos hooks |
| Operador (idealizador) | Validar que o caminho mensagem → resposta com citação funciona | Envia uma mensagem pelo adaptador fake e pergunta ao agente sobre ela |
| P1, Profissional conectado (indireta) | Ter uma base cujo núcleo sobreviva à troca da integração com o WhatsApp | O núcleo funciona sem nenhum código de WhatsApp |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** Toda mensagem gravada pertence a exatamente um espaço de conhecimento e a uma fonte autorizada; mensagem de fonte não autorizada nunca é gravada. 🟡
   - Origem: `_reversa_sdd/sdd/identity-and-sources.md#3. Goals (Objetivos)` (G-01, G-02)
   - Tipo: nova
2. **RN-02:** A mesma mensagem (mesma fonte e mesmo identificador externo) é gravada uma única vez, independentemente de quantas vezes for entregue. 🟡
   - Origem: `_reversa_sdd/sdd/ingestion.md#6. Requisitos Funcionais` (RF-02)
   - Tipo: nova
3. **RN-03:** A mensagem original é evidência imutável: seu conteúdo nunca é alterado depois de gravado. 🟡
   - Origem: `_reversa_sdd/sdd/ingestion.md#6. Requisitos Funcionais` (RF-05)
   - Tipo: nova
4. **RN-04:** Toda afirmação factual da resposta do agente cita uma mensagem que veio da busca no espaço do próprio usuário; sem evidência suficiente, a resposta é "não encontrei evidências suficientes". 🟡
   - Origem: `_reversa_sdd/sdd/conversational-agent.md#6. Requisitos Funcionais` (RF-03, RF-04, RF-05)
   - Tipo: nova
5. **RN-05:** Nenhuma busca é executada sem o filtro do espaço do usuário, e o espaço vem da identidade resolvida, nunca do texto da pergunta. 🟡
   - Origem: `_reversa_sdd/sdd/retrieval.md#6. Requisitos Funcionais` (RF-01)
   - Tipo: nova
6. **RN-06:** O núcleo de conhecimento não depende de nenhum adaptador de canal; a resposta do agente é neutra e quem a formata é o adaptador. 🟡
   - Origem: `_reversa_sdd/sdd/channel-contract.md#3. Goals (Objetivos)` (G-01)
   - Tipo: nova

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | O desenvolvedor deve subir localmente todo o ambiente (banco com busca textual e vetorial, object storage, fila de jobs e a pilha de observabilidade) com um único comando, provisionado por infraestrutura como código. | Must | Em máquina limpa com runtime de containers, o comando deixa todos os serviços saudáveis em ≤ 10 min; um segundo `plan` da IaC não mostra diferenças. | 🟡 |
| RF-02 | O sistema deve organizar o código como monólito modular com os módulos `identity`, `sources`, `ingestion`, `knowledge`, `retrieval`, `agent` e `channels/fake`, cada um em camadas domínio, aplicação e infraestrutura. | Must | Estrutura documentada em ADR e verificada pelos testes de arquitetura (RF-03). | 🟡 |
| RF-03 | O sistema deve ter testes de arquitetura que falham quando: o núcleo importa `channels/*`; o domínio importa aplicação ou infraestrutura; a aplicação importa infraestrutura; um módulo importa arquivo interno de outro; há ciclo entre módulos. | Must | Para cada uma das 5 regras existe um teste que falha ao introduzir um import proibido de exemplo. | 🟡 |
| RF-04 | O sistema deve bloquear funções ou métodos com complexidade ciclomática acima de 10, salvo exceção registrada em arquivo versionado com justificativa e revisor. | Must | Função de exemplo com complexidade 11 faz o lint falhar no hook e na esteira; com exceção registrada, passa. | 🟡 |
| RF-05 | O sistema deve ter pre-commit hooks que executam lint (com complexidade), verificação de tipos, testes de arquitetura, testes unitários dos módulos alterados e varredura de segredos. | Must | Commit com teste quebrado, segredo, violação de arquitetura ou complexidade > 10 é bloqueado; execução típica ≤ 60 s. | 🟡 |
| RF-06 | O sistema deve publicar antes da implementação o contrato do canal (`KnowledgeChannel`, `CanonicalMessage`, `AgentReply`) como esquema versionado e a especificação da API interna, e validar a implementação contra eles. | Must | Mensagem que viola o esquema é rejeitada indicando o campo; teste falha se a API divergir da especificação. | 🟡 |
| RF-07 | O sistema deve fornecer um adaptador de canal fake que implementa o contrato, recebe mensagens injetadas por teste ou por comando do operador e registra as respostas enviadas. | Must | O adaptador fake passa 100% da suíte de testes de contrato. | 🟡 |
| RF-08 | O sistema deve fornecer a suíte de testes de contrato reutilizável que qualquer adaptador de canal deve passar (conexão, recebimento, envio, reconexão simulada). | Must | A suíte é executável contra qualquer implementação do contrato com um único parâmetro de configuração. | 🟡 |
| RF-09 | O sistema deve semear, por comando, um usuário com espaço pessoal, uma conta de canal fake ativa e uma fonte autorizada. | Must | Após o comando, existe 1 espaço `personal` com 1 fonte `authorized`; executar de novo não duplica nada. | 🟡 |
| RF-10 | O sistema deve ingerir mensagens do adaptador, rejeitando fontes não autorizadas, deduplicando pelo identificador externo e gravando a mensagem imutável com proveniência e o disparo de indexação na mesma transação. | Must | Entregar a mesma mensagem 3 vezes resulta em 1 registro; mensagem de fonte não autorizada resulta em 0 registros e incrementa a métrica de rejeição. | 🟡 |
| RF-11 | O sistema deve indexar o texto das mensagens para busca textual em português restrita ao espaço. | Must | Mensagem ingerida fica encontrável por palavra do seu texto em ≤ 60 s. | 🟡 |
| RF-12 | O sistema deve buscar evidências exigindo o espaço do usuário, devolvendo mensagem, trecho, autor, fonte e data, e sinalizando baixa confiança quando não houver resultado relevante. | Must | Busca sem espaço é rejeitada; com dois espaços de conteúdo idêntico, nenhum resultado cruza espaços. | 🟡 |
| RF-13 | O agente deve responder uma pergunta usando apenas as evidências retornadas, com citação (autor, fonte, data) por afirmação, ou "não encontrei evidências suficientes" quando a busca indicar baixa confiança. Nesta feature a resposta é composta de forma determinística a partir das evidências (sem modelo de linguagem), atrás de uma porta de geração de resposta que a feature do agente substituirá por um provedor de LLM. | Must | Toda citação da resposta aponta para uma mensagem presente nos resultados da busca (validado automaticamente); a mesma pergunta sobre o mesmo índice produz sempre a mesma resposta. | 🟢 |
| RF-14 | O agente deve devolver uma resposta neutra (texto, citações estruturadas) que o adaptador fake entrega sem que o núcleo conheça regras do canal. | Must | O mesmo objeto de resposta é aceito pelo adaptador fake sem conversão no núcleo. | 🟡 |
| RF-15 | O sistema deve ter um teste ponta a ponta que injeta uma mensagem pelo adaptador fake, aguarda a indexação, envia uma pergunta e verifica a resposta com citação da mensagem, e outro que verifica a resposta "não encontrei evidências suficientes". | Must | Os dois testes passam na esteira e são obrigatórios para merge. | 🟡 |
| RF-16 | O sistema deve aplicar a DoR como gate de merge na esteira de CI do repositório: build verde, testes ponta a ponta verdes, code review aprovado, análise estática de segurança, auditoria de dependências e varredura de segredos sem achados críticos ou altos, testes de arquitetura sem violações e complexidade dentro do limite. | Must | A proteção da branch principal exige todos esses checks e 1 aprovação; pull request que viola qualquer item não pode ser integrado. | 🟢 |
| RF-17 | O sistema deve instrumentar os módulos com traces, métricas e logs estruturados, exibidos em painéis locais. | Must | Uma pergunta ao agente gera um trace único com etapas de busca e resposta visível no painel local; logs não contêm conteúdo de mensagens. | 🟡 |
| RF-18 | O sistema deve fornecer o harness do conjunto de avaliação: arquivo versionado de perguntas com respostas e mensagens esperadas e um comando que mede acertos, taxa de citação e taxa de "não encontrei". | Should | O comando roda contra o ambiente local e gera relatório com as três métricas. | 🟡 |
| RF-19 | O sistema deve manter a pirâmide de testes com comandos separados para unitário, integração (serviços reais em containers), contrato, mutação e ponta a ponta. | Must | Cada tipo roda isoladamente por comando próprio e todos rodam na esteira. | 🟡 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Arquitetura | Zero violações das 5 regras de dependência (RF-03), executadas no pre-commit e na esteira | `_reversa_sdd/sdd/platform-foundation.md#7. Requisitos Não-Funcionais` (RNF-05), pedido do usuário | 🟢 |
| Manutenibilidade | Complexidade ciclomática ≤ 10 por função ou método; complexidade média por módulo publicada no relatório da esteira | `_reversa_sdd/sdd/platform-foundation.md#7. Requisitos Não-Funcionais` (RNF-06), pedido do usuário | 🟢 |
| Testes | Cobertura de linhas do núcleo ≥ 80%; mutation score do núcleo ≥ 60% | `_reversa_sdd/sdd/platform-foundation.md#3. Goals (Objetivos)` | 🟡 |
| Desempenho | Hooks ≤ 60 s por commit; esteira completa ≤ 20 min; pergunta → resposta no ambiente local P95 < 15 s | `_reversa_sdd/sdd/platform-foundation.md#7`, `_reversa_sdd/sdd/conversational-agent.md#7` | 🟡 |
| Segurança | Segredos só de variáveis de ambiente ou cofre local; varredura de segredos no hook e na esteira; zero achados críticos ou altos | `requirements.md` (Security First, DoR); `_reversa_sdd/sdd/platform-foundation.md#6` (RF-12) | 🟢 |
| Privacidade | Logs e traces sem conteúdo de mensagens, só identificadores | `_reversa_sdd/sdd/channel-contract.md#12. Segurança e Privacidade` | 🟡 |
| Observabilidade | Traces, métricas e logs exportados para a pilha declarada em `requirements.md` (Grafana, Prometheus, Tempo, Loki) | `requirements.md`; restrição declarada pelo usuário, não escolha de implementação | 🟢 |
| Plataforma | Monólito em TypeScript sobre Node.js; repositório no GitHub com GitHub Actions como esteira; segurança da DoR medida por Semgrep (análise estática), OSV-Scanner (dependências) e gitleaks (segredos), todos executáveis localmente | Esclarecimentos de 2026-11-22 (seção 9) | 🟢 |
| Infraestrutura | IaC com Terraform também para o ambiente local; execução 100% local possível, sem serviço pago obrigatório | `requirements.md` (IaC Terraform, Local First); `_reversa_sdd/prd.md#6. Restrições` (custo baixo) | 🟢 |
| Documentação | Documentation e API first: contrato e especificação publicados antes do código; decisões estruturais em ADR | `requirements.md`; `_reversa_sdd/sdd/platform-foundation.md#7` (RNF-04) | 🟢 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Ambiente local sobe com um comando
  Dado uma máquina limpa com runtime de containers
  Quando o desenvolvedor executa o comando de setup
  Então todos os serviços ficam saudáveis em até 10 minutos

Cenário: Pergunta respondida com citação
  Dado um espaço pessoal com uma fonte autorizada
  E a mensagem "O Grafana Alloy centraliza a coleta de telemetria" de "Ana" ingerida pelo adaptador fake
  Quando o usuário pergunta "quem falou do Grafana Alloy?"
  Então a resposta cita a mensagem com autor "Ana", a fonte e a data

Cenário: Pergunta sem evidência
  Dado um espaço pessoal sem mensagens sobre "Temporal"
  Quando o usuário pergunta "quem falou de Temporal?"
  Então a resposta é "não encontrei evidências suficientes"

Cenário: Mensagem duplicada
  Dado uma fonte autorizada
  Quando o adaptador fake entrega a mesma mensagem 3 vezes
  Então existe exatamente 1 mensagem gravada

Cenário: Fonte não autorizada
  Dado uma fonte com status não autorizado
  Quando o adaptador fake entrega uma mensagem dessa fonte
  Então nenhuma mensagem é gravada
  E a métrica de rejeição por fonte não autorizada é incrementada

Cenário: Isolamento entre espaços
  Dado dois usuários com mensagens de conteúdo idêntico em espaços distintos
  Quando o primeiro usuário pergunta sobre esse conteúdo
  Então nenhuma citação aponta para mensagem do segundo usuário

Cenário: Violação de arquitetura bloqueia o commit
  Dado um arquivo do módulo de ingestão que importa código de channels/fake
  Quando o desenvolvedor tenta fazer commit
  Então o hook falha indicando a regra violada

Cenário: Complexidade acima do limite bloqueia o commit
  Dado uma função com complexidade ciclomática 11 sem exceção registrada
  Quando o desenvolvedor tenta fazer commit
  Então o lint falha indicando a função e o valor medido

Cenário: Mensagem inválida pelo contrato
  Dado uma mensagem sem o campo de data
  Quando o adaptador fake a entrega
  Então a mensagem é rejeitada com erro que identifica o campo ausente

Cenário: Segredo no commit
  Dado um arquivo contendo uma credencial
  Quando o desenvolvedor tenta fazer commit
  Então a varredura de segredos bloqueia o commit
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|---------------|
| RF-01 a RF-17, RF-19 | Must | Formam o caminho ponta a ponta e os gates exigidos por `requirements.md` |
| RF-18 (harness de avaliação) | Should | Necessário para medir a tese, pode vir logo após o esqueleto se o tempo apertar |
| RNF de arquitetura e complexidade | Must | Pedido explícito do usuário; precisa valer desde o primeiro commit |
| RNF de mutação ≥ 60% | Should | Meta inicial, ajustável (OQ-03 de `platform-foundation`) |
| Busca vetorial e transcrição | Won't (nesta feature) | Ficam para features seguintes; o esqueleto valida o caminho com busca textual |
| Adaptador Baileys e importador de ZIP | Won't (nesta feature) | O esqueleto usa só o adaptador fake |

## 9. Esclarecimentos

### Sessão 2026-11-22

- **Q:** Como o agente deve gerar a resposta no walking skeleton?
  **R:** De forma determinística, compondo a resposta a partir das evidências, sem modelo de linguagem. A porta de geração de resposta já é definida nesta feature; o provedor de LLM entra na feature do agente. (RF-13 atualizado)
- **Q:** Qual linguagem e runtime do monólito?
  **R:** TypeScript sobre Node.js, como sugerido na ideação e compatível com a biblioteca de captura prevista. (seção 6, Plataforma)
- **Q:** Onde fica o repositório e qual CI aplica a DoR?
  **R:** GitHub com GitHub Actions; a proteção da branch principal exige os checks da DoR e 1 aprovação de review. (RF-16 atualizado)
- **Q:** Quais ferramentas definem "code security sem críticos ou altos" na DoR?
  **R:** Semgrep para análise estática, OSV-Scanner para dependências e gitleaks para segredos, executáveis localmente e na CI, sem custo. (RF-16 e seção 6 atualizados)

## 10. Lacunas

- Nenhuma lacuna aberta. As três dúvidas iniciais foram resolvidas na sessão de 2026-11-22 (seção 9).

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-22 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-11-22 | Sessão de esclarecimentos: resposta determinística, TypeScript/Node.js, GitHub Actions, Semgrep/OSV-Scanner/gitleaks | reversa-clarify |

## Pendências de Qualidade

- Q-018 (sem nome de produto): a seção 6 cita Terraform, Grafana, Prometheus, Tempo e Loki porque são restrições declaradas pelo usuário em `requirements.md`, não escolhas de implementação. Mantido conscientemente.
