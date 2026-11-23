# Spec: retrieval

**Versão:** 1.0
**Status:** Rascunho
**Autor:** reversa-spec-sdd
**Data:** 2026-11-22
**Reviewers:** N/A

> Selo 🟡 PLANEJADO em todos os itens. Fonte: `_reversa_sdd/prd.md`.

---

## 1. Resumo

🟡 Executa a busca híbrida (texto completo, trigramas e similaridade vetorial) sobre o espaço de conhecimento do usuário, com filtros por fonte, autor, período e tipo, e devolve evidências ranqueadas com metadados de citação. O isolamento por `space_id` é aplicado antes de qualquer busca.

---

## 2. Contexto e Motivação

**Problema:**
🟡 Perguntas reais misturam termos exatos ("Temporal"), assuntos ("redução de custo de observabilidade") e filtros ("nos últimos 30 dias, no grupo X"). Nenhum tipo de busca sozinho cobre os três. A busca vetorial sem filtro prévio pode atravessar bases de usuários diferentes.

**Evidências:**
🟡 PRD seção 4 (busca híbrida com filtros, isolamento antes da busca) e critério de aceite "Isolamento".

**Por que agora:**
🟡 A meta de 85% de respostas corretas depende da qualidade da recuperação.

---

## 3. Goals (Objetivos)

- [ ] 🟡 G-01: Recuperar a evidência correta entre os 10 primeiros resultados para a maioria das perguntas do conjunto de avaliação.
- [ ] 🟡 G-02: Nunca retornar evidência de outro espaço.
- [ ] 🟡 G-03: Responder buscas em tempo compatível com uma conversa.

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| 🟡 Recall@10 no conjunto de avaliação (≥ 30 perguntas) | n/a | ≥ 90% | experimento de validação |
| 🟡 Resultados de outro espaço em testes de isolamento | n/a | 0 | v0.1 |
| 🟡 Latência P95 da busca com 100.000 mensagens | n/a | < 800 ms | v0.1 |

---

## 4. Non-Goals (Fora do Escopo)

- 🟡 NG-01: Gerar a resposta em linguagem natural (responsabilidade do `conversational-agent`).
- 🟡 NG-02: Busca entre espaços de usuários diferentes ou em espaços compartilhados (fase seguinte).
- 🟡 NG-03: Reranking com modelo externo pago na v0.1.
- 🟡 NG-04: Busca em imagens por conteúdo visual.

---

## 5. Usuários e Personas

**Usuário primário:** 🟡 `conversational-agent`, que chama a busca como ferramenta.
**Usuário secundário:** 🟡 P1 e P2, indiretamente, pela qualidade das respostas.

**Jornada atual (sem a feature):**
🟡 A busca nativa do WhatsApp encontra só a palavra exata em texto, uma conversa por vez, sem áudios.

**Jornada futura (com a feature):**
1. 🟡 O agente transforma a pergunta em consulta com filtros.
2. 🟡 A busca devolve evidências ranqueadas com autor, grupo, data e trecho.
3. 🟡 O agente responde citando essas evidências.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | 🟡 O sistema deve exigir `space_id` em toda consulta e aplicá-lo como filtro na própria query SQL de cada estratégia, antes do ranqueamento. | Must | 🟡 Consulta sem `space_id` é rejeitada; teste com 2 espaços com conteúdo idêntico nunca cruza resultados. |
| RF-02 | 🟡 O sistema deve executar em paralelo busca de texto completo, busca por trigramas e busca vetorial (top 50 cada). | Must | 🟡 Cada estratégia contribui com candidatos no resultado de depuração. |
| RF-03 | 🟡 O sistema deve combinar os resultados por Reciprocal Rank Fusion (k=60) e devolver os N primeiros (padrão 10, máximo 50). | Must | 🟡 Resultado final é determinístico para a mesma consulta e o mesmo índice. |
| RF-04 | 🟡 O sistema deve aceitar filtros por `source_ids`, `participant_ids`, intervalo de datas, `kind` e `theme_id`. | Must | 🟡 Filtro de período "últimos 30 dias" exclui mensagens mais antigas. |
| RF-05 | 🟡 O sistema deve devolver, por resultado: mensagem, trecho, score, autor, título da fonte, data, tipo e faixa de tempo do áudio quando houver. | Must | 🟡 Resultado de áudio inclui `audio_start_s` e `audio_end_s`. |
| RF-06 | 🟡 O sistema deve agrupar trechos da mesma mensagem e retornar a mensagem uma vez com o melhor trecho. | Must | 🟡 Mensagem com 3 trechos relevantes aparece 1 vez. |
| RF-07 | 🟡 O sistema deve oferecer busca por contexto: dada uma mensagem, retornar as K mensagens anteriores e posteriores da mesma fonte. | Should | 🟡 K=5 retorna até 10 mensagens vizinhas em ordem cronológica. |
| RF-08 | 🟡 O sistema deve sinalizar `low_confidence` quando o melhor score combinado ficar abaixo do limiar configurado. | Must | 🟡 Pergunta sem relação com a base retorna `low_confidence=true`. |
| RF-09 | 🟡 O sistema deve operar sem embeddings (só texto completo e trigramas) quando o embedder estiver indisponível, indicando `degraded=true`. | Must | 🟡 Com o embedder desligado, a busca responde e marca `degraded`. |

### 6.2 Fluxo Principal (Happy Path)

1. 🟡 O agente chama `search(space_id, query, filters)`.
2. 🟡 O sistema valida `space_id` e os filtros.
3. 🟡 O sistema executa as três estratégias com o filtro de espaço e os filtros informados.
4. 🟡 O sistema funde os rankings, agrupa por mensagem e calcula a confiança.
5. 🟡 Resultado: lista ranqueada de evidências com metadados de citação.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Busca exata:**
1. 🟡 A consulta vem entre aspas; o sistema usa somente texto completo por frase exata.

**Fluxo Alternativo B — Sem resultados:**
1. 🟡 Nenhuma estratégia retorna candidatos; o sistema retorna lista vazia com `low_confidence=true`.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | 🟡 Performance | 🟡 P95 < 800 ms com 100.000 mensagens | 🟡 Índices HNSW/GIN adequados. |
| RNF-02 | 🟡 Segurança | 🟡 Isolamento verificado em teste automatizado a cada build | 🟡 Teste de dois espaços. |
| RNF-03 | 🟡 Observabilidade | 🟡 Trace por consulta com tempo de cada estratégia | 🟡 OpenTelemetry → Tempo. |

---

## 8. Design e Interface

**Componentes afetados:** 🟡 Serviço de busca (módulo do monólito), exposto como ferramenta do agente e endpoint interno.

**Comportamento esperado:**
🟡 Interface `search(space_id, query, filters, limit)` e `context(space_id, message_id, k)`; ambos sem acesso a dados fora do espaço.

**Estados da UI:**
- 🟡 Estado vazio: lista vazia com `low_confidence=true`.
- 🟡 Estado de carregamento: não se aplica (chamada síncrona).
- 🟡 Estado de erro: erro com código (`invalid_filter`, `space_required`, `timeout`).
- 🟡 Estado de sucesso: lista ranqueada com metadados.

---

## 9. Modelo de Dados

```
SearchRequest { space_id: uuid, query: text, filters: { source_ids?, participant_ids?, from?, to?, kind?, theme_id? }, limit: int }
SearchResult { message_id: uuid, chunk_text: text, score: float, author: text, source_title: text,
               sent_at: timestamptz, kind: text, audio_start_s?: numeric, audio_end_s?: numeric }
SearchResponse { results: SearchResult[], low_confidence: bool, degraded: bool }
```

**Migrações necessárias:** 🟡 Não (usa tabelas de `knowledge-indexing`; apenas índices).

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| 🟡 PostgreSQL (FTS, pg_trgm, pgvector) | Obrigatória | 🟡 Busca falha com erro `unavailable`; o agente informa indisponibilidade. |
| 🟡 Embedder (para vetorizar a consulta) | Opcional | 🟡 Modo `degraded` sem busca vetorial (RF-09). |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| 🟡 EC-01: Consulta sem `space_id` | 🟡 Erro de programação | 🟡 Rejeitar com `space_required`; nunca buscar sem filtro. |
| 🟡 EC-02: Timeout de uma estratégia | 🟡 Estratégia > 2 s | 🟡 Descartar essa estratégia, retornar as demais e marcar `degraded`. |
| 🟡 EC-03: Filtro de período invertido | 🟡 `from` > `to` | 🟡 Rejeitar com `invalid_filter`. |
| 🟡 EC-04: Consulta vazia ou só stopwords | 🟡 "o que?" | 🟡 Retornar lista vazia com `low_confidence=true`. |
| 🟡 EC-05: Fonte em exclusão | 🟡 Status `deleting` | 🟡 Excluir a fonte dos resultados imediatamente. |

---

## 12. Segurança e Privacidade

- **Autenticação:** 🟡 Chamada interna; `space_id` vem da identidade resolvida pelo agente, nunca do texto do usuário.
- **Autorização:** 🟡 Filtro obrigatório por `space_id` e fontes não excluídas.
- **Dados sensíveis:** 🟡 Logs com hash da consulta, sem o texto.
- **Auditoria:** 🟡 Contagem de consultas por espaço.

---

## 13. Plano de Rollout

- **Estratégia:** 🟡 Habilitado na v0.1; ajustar o limiar de `low_confidence` com o conjunto de avaliação.
- **Como reverter (rollback):** 🟡 Limiar e pesos por configuração, sem deploy.
- **Monitoramento pós-deploy:** 🟡 Latência por estratégia, taxa de `low_confidence` e de `degraded`.

---

## 14. Open Questions

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | 🟡 Qual limiar de `low_confidence` equilibra falsos "não encontrei" e respostas inventadas? | Alto | Leandro | Experimento |
| OQ-02 | 🟡 Vale aplicar reranking local (cross-encoder) se o Recall@10 ficar abaixo de 90%? | Médio | Leandro | Experimento |

---

## 15. Decisões Tomadas (Decision Log)

| Decisão | Alternativas consideradas | Racional |
|---------|--------------------------|---------|
| 🟡 Reciprocal Rank Fusion | 🟡 Soma ponderada de scores | 🟡 Não exige calibrar escalas diferentes. |
| 🟡 Filtro de espaço dentro de cada query | 🟡 Filtrar após a busca | 🟡 Isolamento antes da recuperação, como exige o PRD. |

---

## Apêndice

### Referências
- 🟡 `_reversa_sdd/prd.md` seções 3, 4, 9

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
