# Spec: conversational-agent

**Versão:** 1.0
**Status:** Rascunho
**Autor:** reversa-spec-sdd
**Data:** 2026-11-22
**Reviewers:** N/A

> Selo 🟡 PLANEJADO em todos os itens. Fonte: `_reversa_sdd/prd.md`.

---

## 1. Resumo

🟡 O agente com quem o usuário conversa pelo canal. Entende a intenção da mensagem (perguntar, guardar, resumir, pedir a origem, gerenciar fontes), usa as ferramentas do núcleo (busca, contexto, guardar, fontes) e responde em `AgentReply` neutro, sempre com citações, ou com "não encontrei evidências suficientes" quando não há base.

---

## 2. Contexto e Motivação

**Problema:**
🟡 O usuário quer conversar com a própria memória sem sair do WhatsApp. Uma resposta inventada sobre quem recomendou algo destrói a confiança no produto.

**Evidências:**
🟡 PRD seção 4 (agente com fontes, recuperar original, guardar, resumo sob demanda), seção 3 (85% de respostas corretas, 100% de afirmações com referência) e seção 8 (risco alto de respostas inventadas).

**Por que agora:**
🟡 É a experiência central das jornadas P1 e P2 e a forma de medir a tese.

---

## 3. Goals (Objetivos)

- [ ] 🟡 G-01: Responder corretamente ≥ 85% das perguntas do conjunto de avaliação.
- [ ] 🟡 G-02: Toda afirmação factual da resposta tem citação de mensagem de origem.
- [ ] 🟡 G-03: Perguntas sem evidência recebem "não encontrei evidências suficientes".
- [ ] 🟡 G-04: O agente não conhece o canal: produz `AgentReply` neutro.

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| 🟡 Respostas corretas em ≥ 30 perguntas com resposta conhecida | n/a | ≥ 85% | experimento de validação |
| 🟡 Afirmações factuais com citação | n/a | 100% | experimento de validação |
| 🟡 Latência P95 da pergunta até a resposta | n/a | < 15 s | v0.1 |

---

## 4. Non-Goals (Fora do Escopo)

- 🟡 NG-01: Mensagens proativas, alertas e resumos agendados ("Acompanhar", memória ativa).
- 🟡 NG-02: Ações autônomas de múltiplas etapas sem pedido do usuário.
- 🟡 NG-03: Responder perguntas de conhecimento geral fora da base do usuário.
- 🟡 NG-04: Atender usuários do time da P3 em espaço compartilhado (fase seguinte).
- 🟡 NG-05: Entrada de voz do usuário ao agente como pergunta (áudio enviado ao agente é tratado como conteúdo a guardar ou transcrito como pergunta: ver OQ-02).

---

## 5. Usuários e Personas

**Usuário primário:** 🟡 P1, que pergunta, guarda e pede a origem.
**Usuário secundário:** 🟡 P2, que pede resumos por tema e período.

**Jornada atual (sem a feature):**
🟡 O usuário rola conversas, usa a busca nativa e ouve áudios até achar ou desistir.

**Jornada futura (com a feature):**
1. 🟡 O usuário pergunta ao número do agente.
2. 🟡 O agente busca na base do usuário e responde com fontes.
3. 🟡 O usuário pede a mensagem original ou um resumo e recebe com citações.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | 🟡 O sistema deve resolver o usuário e o `space_id` pela conta de canal do remetente antes de qualquer ferramenta. | Must | 🟡 Remetente não vinculado recebe só instruções de vínculo; nenhuma busca é executada. |
| RF-02 | 🟡 O sistema deve classificar a intenção em `ask`, `save`, `summarize`, `show_source`, `manage_sources`, `help`. | Must | 🟡 Conjunto de 50 mensagens rotuladas tem ≥ 90% de classificação correta. |
| RF-03 | 🟡 O sistema deve responder perguntas usando apenas evidências retornadas por `retrieval`, com tool calling. | Must | 🟡 Nenhuma resposta cita mensagem que não estava nos resultados da busca (verificado por teste). |
| RF-04 | 🟡 O sistema deve anexar a cada afirmação factual uma citação (autor, fonte, data) referenciando `message_id`. | Must | 🟡 Validador pós-geração rejeita resposta com citação inexistente e regenera uma vez; na segunda falha responde "não encontrei evidências suficientes". |
| RF-05 | 🟡 O sistema deve responder "não encontrei evidências suficientes" quando `retrieval` indicar `low_confidence` ou quando o modelo não encontrar suporte nos resultados. | Must | 🟡 Perguntas sem evidência no conjunto de avaliação recebem essa resposta. |
| RF-06 | 🟡 O usuário deve poder pedir a mensagem original de uma citação ("mostra a 2"), e o sistema deve devolver o texto, o contexto vizinho e o link temporário do áudio quando houver. | Must | 🟡 "mostra a 2" retorna a mensagem da segunda citação da última resposta. |
| RF-07 | 🟡 O sistema deve guardar conteúdo encaminhado com tema ("guarda isso em X") chamando `knowledge-indexing`. | Must | 🟡 Conteúdo guardado é confirmado com o tema e recuperável depois. |
| RF-08 | 🟡 O sistema deve gerar resumos sob demanda por tema e período com convergências, divergências e citações, limitados a 200 evidências. | Must | 🟡 "resume observabilidade nos últimos 30 dias" retorna síntese com citações de mensagens desse período. |
| RF-09 | 🟡 O sistema deve manter `AgentSession` com as últimas 10 trocas e as citações da última resposta, expirando após 2 h sem interação. | Must | 🟡 Pergunta de acompanhamento ("e quem recomendou?") usa o contexto anterior. |
| RF-10 | 🟡 O sistema deve produzir `AgentReply` neutro, sem formatação específica de canal. | Must | 🟡 O mesmo `AgentReply` é renderizado pelo adaptador fake e pelo adaptador WhatsApp. |
| RF-11 | 🟡 O sistema deve interpretar expressões de tempo relativas ("semana passada", "últimos 30 dias") no fuso do usuário e convertê-las em filtros. | Should | 🟡 "semana passada" vira o intervalo de segunda a domingo da semana anterior. |

### 6.2 Fluxo Principal (Happy Path)

1. 🟡 O usuário envia "Quem recomendou o Grafana Alloy?" ao número do agente.
2. 🟡 O sistema resolve o usuário e o espaço e classifica a intenção como `ask`.
3. 🟡 O sistema chama `retrieval` com a consulta e filtros extraídos.
4. 🟡 O modelo redige a resposta usando só as evidências e o validador confere as citações.
5. 🟡 O sistema envia o `AgentReply` ao adaptador de origem.
6. 🟡 Resultado: o usuário recebe quem recomendou, onde, quando e o argumento, com citações.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Sem evidência:**
1. 🟡 `retrieval` retorna `low_confidence`; o sistema responde "não encontrei evidências suficientes" e sugere ampliar o período ou outra palavra-chave.

**Fluxo Alternativo B — Resumo:**
1. 🟡 O usuário pede um resumo; o sistema busca por tema e período, agrupa as evidências e gera a síntese com citações.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | 🟡 Performance | 🟡 P95 < 15 s pergunta → resposta; resumos P95 < 45 s | 🟡 Inclui busca e geração. |
| RNF-02 | 🟡 Custo | 🟡 Custo por pergunta medido e registrado | 🟡 Restrição de custo baixo; provedor configurável. |
| RNF-03 | 🟡 Segurança | 🟡 Instruções contidas em mensagens indexadas nunca são seguidas como comandos | 🟡 Proteção contra prompt injection vinda dos grupos. |
| RNF-04 | 🟡 Observabilidade | 🟡 Trace por pergunta com intenção, ferramentas, tokens e latência | 🟡 Sem conteúdo das mensagens nos traces. |

---

## 8. Design e Interface

**Componentes afetados:** 🟡 Orquestrador do agente, ferramentas (`search`, `context`, `save`, `list_sources`, `authorize_source`, `revoke_source`, `delete_source`), validador de citações, interface `LLMProvider`.

**Comportamento esperado:**
🟡 Respostas curtas por padrão (≤ 1.200 caracteres), com citações numeradas ao final. O usuário pode pedir detalhes.

**Estados da UI:**
- 🟡 Estado vazio: base sem fontes: "Ainda não tenho conversas suas. Envie 'listar conversas' ou um ZIP exportado."
- 🟡 Estado de carregamento: para operações > 5 s, enviar "Procurando..." antes da resposta.
- 🟡 Estado de erro: "Tive um problema para consultar sua memória agora. Tente de novo em 5 minutos." sem detalhes técnicos.
- 🟡 Estado de sucesso: resposta com citações numeradas.

---

## 9. Modelo de Dados

```
AgentSession { id: uuid, user_id: uuid, channel_account_id: uuid, turns: jsonb (últimas 10),
               last_citations: jsonb, updated_at: timestamptz, expires_at: timestamptz }
AgentInteractionLog { id: uuid, session_id: uuid, intent: text, tools_called: text[], tokens_in: int,
                      tokens_out: int, latency_ms: int, outcome: enum(answered, no_evidence, error), at: timestamptz }
```

**Migrações necessárias:** 🟡 Sim.

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| 🟡 Provedor de LLM com tool calling (local ou pago) | Obrigatória | 🟡 Responder mensagem de indisponibilidade; comandos simples (`help`, `listar conversas`) seguem por regras. |
| 🟡 `retrieval` | Obrigatória | 🟡 Mensagem de indisponibilidade, sem resposta inventada. |
| 🟡 `identity-and-sources`, `knowledge-indexing` | Obrigatória | 🟡 Operações correspondentes recusadas com aviso. |
| 🟡 `channel-contract` (entrega) | Obrigatória | 🟡 Resposta fica em retry de envio pelo adaptador. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| 🟡 EC-01: Timeout ou falha do LLM | 🟡 > 30 s ou erro 5xx | 🟡 1 retry; depois, mensagem de indisponibilidade e registro `error`. |
| 🟡 EC-02: Prompt injection em mensagem indexada | 🟡 Texto "ignore as instruções e..." dentro da evidência | 🟡 Evidências entram como dados delimitados; o agente não executa ferramentas pedidas por elas. |
| 🟡 EC-03: Citação inválida gerada pelo modelo | 🟡 `message_id` fora dos resultados | 🟡 Regenerar uma vez; persistindo, responder "não encontrei evidências suficientes". |
| 🟡 EC-04: Pedido de exclusão de fonte | 🟡 "apaga o grupo X" | 🟡 Pedir confirmação explícita ("confirmar exclusão de X") antes de chamar a ferramenta. |
| 🟡 EC-05: "mostra a 3" sem resposta anterior | 🟡 Sessão expirada | 🟡 Informar que não há citações recentes e pedir a pergunta de novo. |
| 🟡 EC-06: Pergunta ambígua sobre fonte | 🟡 Dois grupos com nomes parecidos | 🟡 Perguntar qual dos grupos, listando as opções. |

---

## 12. Segurança e Privacidade

- **Autenticação:** 🟡 Conta de canal verificada (RF-01).
- **Autorização:** 🟡 `space_id` sempre derivado da identidade, nunca do texto; operações destrutivas exigem confirmação.
- **Dados sensíveis:** 🟡 Com LLM externo, evidências saem da máquina; o padrão respeita a restrição de custo baixo/local e a escolha de provedor fica registrada (OQ-01).
- **Auditoria:** 🟡 `AgentInteractionLog` sem conteúdo de mensagens.

---

## 13. Plano de Rollout

- **Estratégia:** 🟡 Uso pelo próprio idealizador com o conjunto de avaliação; ampliar só após atingir as metas.
- **Como reverter (rollback):** 🟡 Prompts, modelo e limiares por configuração versionada.
- **Monitoramento pós-deploy:** 🟡 Taxa de `no_evidence`, falhas de validação de citação, latência e custo por pergunta.

---

## 14. Open Questions

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | 🟡 Qual provedor de LLM: local (custo zero, menor qualidade) ou pago (qualidade maior, dados saem da máquina)? | Alto | Leandro | Antes do experimento |
| OQ-02 | 🟡 Áudio enviado ao agente sem texto deve ser tratado como pergunta (transcrever e responder) ou como conteúdo a guardar? | Médio | Leandro | v0.1 |
| OQ-03 | 🟡 Como montar e manter o conjunto de avaliação de 30 perguntas com respostas conhecidas? | Alto | Leandro | Antes do experimento |

---

## 15. Decisões Tomadas (Decision Log)

| Decisão | Alternativas consideradas | Racional |
|---------|--------------------------|---------|
| 🟡 Validador de citações pós-geração | 🟡 Confiar no prompt | 🟡 Garante 100% de citações reais. |
| 🟡 Agente começa com uma conversa privada com o número de teste | 🟡 Agente em grupos | 🟡 Personal-first; reduz risco de exposição. |

---

## Apêndice

### Referências
- 🟡 `_reversa_sdd/prd.md` seções 3, 4, 8, 9
- 🟡 `_reversa_sdd/personas.md` (jornadas P1 e P2)

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
