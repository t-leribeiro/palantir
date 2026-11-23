# Spec: platform-foundation

**Versão:** 1.0
**Status:** Rascunho
**Autor:** reversa-spec-sdd
**Data:** 2026-11-22
**Reviewers:** N/A

> Selo 🟡 PLANEJADO em todos os itens. Fonte: `_reversa_sdd/prd.md` e `requirements.md`.

---

## 1. Resumo

🟡 Fundação transversal do repositório: ambiente local-first com um comando, monólito modular com fronteiras verificadas, pirâmide de testes (unitário, integração, contrato, mutação, E2E), pre-commit hooks, IaC com Terraform, observabilidade (Grafana, Prometheus, Tempo, Loki), Definition of Ready como gate e o harness do conjunto de avaliação.

---

## 2. Contexto e Motivação

**Problema:**
🟡 Os requisitos de engenharia do projeto (`requirements.md`) exigem documentação e API first, segurança first, local first, TDD, Clean Architecture e uma DoR com build, E2E, code review e segurança sem achados críticos ou altos. Sem uma fundação, cada componente faria isso do seu jeito.

**Evidências:**
🟡 `requirements.md`; PRD seção 4 (engenharia conforme `requirements.md`) e seção 6 (monólito modular + workers, local-first).

**Por que agora:**
🟡 A fundação precisa existir antes do primeiro componente para que TDD e os gates valham desde o primeiro commit.

---

## 3. Goals (Objetivos)

- [ ] 🟡 G-01: Subir o ambiente completo local com um comando.
- [ ] 🟡 G-02: Nenhum commit entra sem passar os hooks; nenhuma entrega é aceita sem a DoR.
- [ ] 🟡 G-03: O teste de arquitetura impede o núcleo de depender de adaptadores.
- [ ] 🟡 G-04: Traces, métricas e logs de todos os módulos visíveis no Grafana local.

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| 🟡 Tempo para subir o ambiente local do zero | n/a | ≤ 10 min | v0.1 |
| 🟡 Cobertura de testes unitários do núcleo | n/a | ≥ 80% de linhas | v0.1 |
| 🟡 Mutation score do núcleo | n/a | ≥ 60% | v0.1 |
| 🟡 Achados de segurança críticos ou altos abertos | n/a | 0 | contínuo |

---

## 4. Non-Goals (Fora do Escopo)

- 🟡 NG-01: Kubernetes, microsserviços e Kafka.
- 🟡 NG-02: Ambiente de produção em nuvem na v0.1; o Terraform cobre o ambiente local e um módulo de nuvem fica apenas preparado.
- 🟡 NG-03: Alta disponibilidade e SLAs.
- 🟡 NG-04: Escolha final de provedor de nuvem.

---

## 5. Usuários e Personas

**Usuário primário:** 🟡 Desenvolvedores e agentes de IA que implementam o Palantír.
**Usuário secundário:** 🟡 Operador (o próprio idealizador), que roda e observa o sistema localmente.

**Jornada atual (sem a feature):**
🟡 Repositório sem código, sem ambiente, sem testes nem gates.

**Jornada futura (com a feature):**
1. 🟡 O desenvolvedor clona e executa o comando de setup.
2. 🟡 Escreve o teste, implementa e faz commit; os hooks validam.
3. 🟡 A esteira valida a DoR e o operador observa o sistema no Grafana.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | 🟡 O sistema deve subir localmente PostgreSQL (pgvector, pg_trgm), MinIO, fila de jobs, Grafana, Prometheus, Tempo e Loki com um único comando. | Must | 🟡 Em máquina limpa com Docker, o comando deixa todos os serviços saudáveis em ≤ 10 min. |
| RF-02 | 🟡 O sistema deve provisionar a infraestrutura local por Terraform, com módulos reutilizáveis para nuvem futura. | Must | 🟡 `terraform plan` sem diferenças após `apply`; nenhum recurso criado fora do Terraform. |
| RF-03 | 🟡 O sistema deve organizar o código como monólito modular com os módulos `identity`, `sources`, `ingestion`, `media`, `knowledge`, `retrieval`, `agent`, `channels/*`, em camadas Clean Architecture (domínio, aplicação, infraestrutura). | Must | 🟡 Estrutura de pastas e regras de dependência documentadas e verificadas pelo RF-04. |
| RF-04 | 🟡 O sistema deve ter teste de arquitetura que falha quando o núcleo importa `channels/*` ou quando o domínio importa infraestrutura. | Must | 🟡 Introduzir um import proibido faz o teste falhar no hook e na esteira. |
| RF-05 | 🟡 O sistema deve ter pre-commit hooks que rodam lint (incluindo complexidade ciclomática, RNF-06), verificação de tipos, testes de arquitetura (RNF-05), testes unitários dos módulos alterados e varredura de segredos. | Must | 🟡 Commit com teste quebrado, segredo, violação de arquitetura ou função com complexidade > 10 é bloqueado. |
| RF-06 | 🟡 O sistema deve manter a pirâmide de testes: unitários, integração (com containers reais), contrato (suíte de `channel-contract`), mutação e E2E. | Must | 🟡 Cada tipo tem comando próprio e roda na esteira. |
| RF-07 | 🟡 O sistema deve ter um teste E2E que percorre o walking skeleton: mensagem entra por adaptador fake, é ingerida, indexada e recuperada por uma pergunta ao agente com citação. | Must | 🟡 E2E verde é obrigatório para merge. |
| RF-08 | 🟡 O sistema deve aplicar a DoR como gate de merge: build verde, E2E verde, code review aprovado, análise de segurança (SAST e dependências) sem achados críticos ou altos, testes de arquitetura sem violações (RNF-05) e complexidade ciclomática dentro do limite (RNF-06). | Must | 🟡 PR com achado alto, violação de arquitetura ou função com complexidade > 10 não pode ser mergeado. |
| RF-09 | 🟡 O sistema deve instrumentar todos os módulos com OpenTelemetry (traces → Tempo, métricas → Prometheus, logs estruturados JSON → Loki) e provisionar dashboards no Grafana. | Must | 🟡 Uma pergunta ao agente gera um trace único com spans de busca e LLM visível no Grafana. |
| RF-10 | 🟡 O sistema deve publicar a especificação da API (OpenAPI) e os JSON Schemas do contrato antes da implementação (API first) e validar a implementação contra eles. | Must | 🟡 Teste falha se um endpoint divergir do OpenAPI. |
| RF-11 | 🟡 O sistema deve fornecer o harness do conjunto de avaliação: arquivo versionado de perguntas com respostas e mensagens esperadas e um comando que mede acertos, citações e "não encontrei". | Must | 🟡 O comando gera relatório com as métricas do PRD seção 3. |
| RF-12 | 🟡 O sistema deve carregar segredos só de variáveis de ambiente ou cofre local, nunca do repositório, e impedir segredos em logs. | Must | 🟡 Varredura de segredos no hook e na esteira; teste procura segredos conhecidos nos logs. |

### 6.2 Fluxo Principal (Happy Path)

1. 🟡 O desenvolvedor executa o comando de setup; o Terraform sobe a infraestrutura local.
2. 🟡 O desenvolvedor escreve um teste que falha e implementa até passar (TDD).
3. 🟡 O commit passa pelos pre-commit hooks.
4. 🟡 O PR roda a esteira completa: testes, mutação, E2E, segurança e teste de arquitetura.
5. 🟡 O revisor aprova e o merge é liberado pela DoR.
6. 🟡 Resultado: mudança integrada e observável no Grafana local.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Achado de segurança alto:**
1. 🟡 A esteira reporta achado alto; o merge é bloqueado até correção ou exceção registrada com justificativa.

**Fluxo Alternativo B — Avaliação de qualidade:**
1. 🟡 O operador roda o harness de avaliação; o sistema gera o relatório comparando com as metas do PRD.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | 🟡 Performance dos hooks | 🟡 ≤ 60 s por commit | 🟡 Só módulos alterados. |
| RNF-02 | 🟡 Duração da esteira | 🟡 ≤ 20 min | 🟡 Mutação pode rodar só no núcleo alterado. |
| RNF-03 | 🟡 Custo | 🟡 Execução 100% local possível | 🟡 Restrição de custo baixo. |
| RNF-04 | 🟡 Documentação | 🟡 Documentation first: toda decisão estrutural registrada em ADR | 🟡 `docs/adr/`. |
| RNF-05 | 🟡 Testes de arquitetura | 🟡 0 violações das regras de dependência | 🟡 Regras mínimas: (a) núcleo não importa `channels/*`; (b) domínio não importa aplicação nem infraestrutura; (c) aplicação não importa infraestrutura (só portas); (d) módulos só se comunicam pela API pública do módulo, nunca por arquivos internos de outro módulo; (e) sem ciclos de dependência entre módulos. Executados no pre-commit e na esteira; violação bloqueia commit e merge. |
| RNF-06 | 🟡 Complexidade ciclomática | 🟡 ≤ 10 por função/método | 🟡 Medida por análise estática no lint. Acima de 10 bloqueia commit e merge; exceção só registrada em arquivo versionado com justificativa e revisor. Complexidade média por módulo publicada no relatório da esteira. |

---

## 8. Design e Interface

**Componentes afetados:** 🟡 Estrutura do repositório, Terraform, configuração de hooks, esteira de CI, dashboards do Grafana, harness de avaliação.

**Comportamento esperado:**
🟡 Comandos padronizados para setup, testes por tipo, avaliação e observabilidade, documentados no `CLAUDE.md`/`AGENTS.md` assim que existirem.

**Estados da UI:**
- 🟡 Estado vazio: dashboards sem dados exibem "sem tráfego no período".
- 🟡 Estado de carregamento: setup mostra o progresso de cada serviço.
- 🟡 Estado de erro: setup falha indicando o serviço não saudável e o log.
- 🟡 Estado de sucesso: todos os health checks verdes.

---

## 9. Modelo de Dados

```
EvaluationCase { id: text, question: text, expected_answer: text, expected_message_ids: text[], expects_no_evidence: bool }
EvaluationRun { id: uuid, at: timestamptz, model_config: jsonb, accuracy: float, citation_rate: float, no_evidence_rate: float }
```

**Migrações necessárias:** 🟡 Não para o produto; o conjunto de avaliação fica em arquivo versionado.

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| 🟡 Docker / runtime de containers | Obrigatória | 🟡 Ambiente local não sobe; setup falha com instrução. |
| 🟡 Terraform | Obrigatória | 🟡 Sem provisionamento; setup falha. |
| 🟡 Grafana, Prometheus, Tempo, Loki | Obrigatória | 🟡 Aplicação funciona, sem observabilidade; alerta no setup. |
| 🟡 Ferramentas de SAST e análise de dependências | Obrigatória | 🟡 DoR não pode ser verificada; merge bloqueado. |
| 🟡 Plataforma de CI (a definir) | Obrigatória | 🟡 Hooks locais seguem; merge fica manual com checklist. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| 🟡 EC-01: Porta local ocupada | 🟡 Outro serviço usa 5432 ou 3000 | 🟡 Setup falha indicando a porta e como configurá-la. |
| 🟡 EC-02: Teste de mutação lento demais | 🟡 Esteira > 20 min | 🟡 Rodar mutação incremental só nos arquivos alterados. |
| 🟡 EC-03: Falso positivo de segurança | 🟡 Ferramenta marca alto indevidamente | 🟡 Exceção registrada em arquivo versionado com justificativa e revisor. |
| 🟡 EC-04: Falha de um serviço de observabilidade | 🟡 Tempo ou Loki fora do ar | 🟡 Aplicação continua; exportadores descartam com buffer limitado. |
| 🟡 EC-05: Hook contornado com `--no-verify` | 🟡 Commit sem hooks | 🟡 A esteira repete as mesmas verificações e bloqueia o merge. |

---

## 12. Segurança e Privacidade

- **Autenticação:** 🟡 Serviços locais com credenciais geradas no setup, fora do repositório.
- **Autorização:** 🟡 Merge só com review aprovado (DoR).
- **Dados sensíveis:** 🟡 Logs estruturados sem conteúdo de mensagens; dados de teste anonimizados.
- **Auditoria:** 🟡 Histórico de execução da esteira e exceções de segurança versionadas.

---

## 13. Plano de Rollout

- **Estratégia:** 🟡 Primeira entrega do projeto, antes de qualquer componente de produto (walking skeleton com adaptador fake).
- **Como reverter (rollback):** 🟡 Tudo versionado; `terraform destroy` limpa o ambiente local.
- **Monitoramento pós-deploy:** 🟡 Duração dos hooks e da esteira, taxa de falha por tipo de teste.

---

## 14. Open Questions

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | 🟡 Qual plataforma de CI (GitHub Actions ou outra) e onde o repositório será hospedado? | Médio | Leandro | Antes do primeiro PR |
| OQ-02 | 🟡 Quais ferramentas de SAST e de análise de dependências definem "code security sem críticos ou altos"? | Médio | Leandro | Antes do primeiro PR |
| OQ-03 | 🟡 Os alvos de cobertura (80%) e mutação (60%) são adequados? | Baixo | Leandro | v0.1 |
| OQ-04 | 🟡 O limite de complexidade ciclomática 10 por função é o desejado, ou prefere um limite mais estrito (ex.: 8) ou complementar com complexidade cognitiva? | Baixo | Leandro | Antes do primeiro PR |

---

## 15. Decisões Tomadas (Decision Log)

| Decisão | Alternativas consideradas | Racional |
|---------|--------------------------|---------|
| 🟡 Monólito modular + workers | 🟡 Microsserviços | 🟡 PRD e KISS/YAGNI. |
| 🟡 Terraform também para o ambiente local | 🟡 Só docker compose | 🟡 Requisito IaC com Terraform; reaproveita módulos na nuvem. |
| 🟡 Walking skeleton com adaptador fake primeiro | 🟡 Começar pelo Baileys | 🟡 Valida contrato e pipeline sem depender da integração instável. |

---

## Apêndice

### Referências
- 🟡 `requirements.md`
- 🟡 `_reversa_sdd/prd.md` seções 3, 4, 6

### Histórico de Revisões
| Versão | Data | Autor | Mudanças |
|--------|------|-------|---------|
| 1.0 | 2026-11-22 | reversa-spec-sdd | Criação inicial |

---

## Relatório de avaliação (reversa-spec-sdd)

**Score total:** 100.0/100, ⭐ Excelente — Pronta para implementação
**Iterações:** 1
**Avaliado em:** 2026-11-22T20:50:19-03:00 (scorer `spec_scorer.py`, heurística estrutural)

| Dimensão | Score | Contribuição |
|---|---|---|
| Completude | 100% | 30.0 |
| Testabilidade | 100% | 25.0 |
| Clareza | 100% | 20.0 |
| Escopo | 100% | 15.0 |
| Edge Cases | 100% | 10.0 |

**Gaps críticos:** nenhum.
**Sugestões:** nenhuma do scorer. As pendências de conteúdo estão na seção 14 (Open Questions).
