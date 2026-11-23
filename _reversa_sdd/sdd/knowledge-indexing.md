# Spec: knowledge-indexing

**Versão:** 1.0
**Status:** Rascunho
**Autor:** reversa-spec-sdd
**Data:** 2026-11-22
**Reviewers:** N/A

> Selo 🟡 PLANEJADO em todos os itens. Fonte: `_reversa_sdd/prd.md`.

---

## 1. Resumo

🟡 Transforma mensagens e transcrições em material pesquisável (índice de texto completo, trigramas e embeddings por trecho) e mantém o conhecimento derivado (`KnowledgeItem`) sempre ligado às mensagens que o sustentam (`EvidenceReference`). Também atende ao comportamento "Guardar": conteúdo encaminhado ao agente com um tema.

---

## 2. Contexto e Motivação

**Problema:**
🟡 A busca precisa encontrar tanto a palavra exata quanto o assunto, e qualquer conclusão do agente precisa apontar para a mensagem original. Misturar evidência com interpretação impede reprocessar quando modelos melhorarem.

**Evidências:**
🟡 PRD seção 4 (indexação híbrida, "Guardar", separação entre evidência e conhecimento derivado); princípio "Evidence over hallucination".

**Por que agora:**
🟡 `retrieval` e `conversational-agent` dependem do índice e da ligação com a evidência.

---

## 3. Goals (Objetivos)

- [ ] 🟡 G-01: Toda mensagem com texto ou transcrição fica indexada para texto completo, trigramas e vetor.
- [ ] 🟡 G-02: Todo `KnowledgeItem` tem pelo menos uma `EvidenceReference`.
- [ ] 🟡 G-03: O usuário consegue guardar conteúdo com tema e recuperá-lo pelo tema.
- [ ] 🟡 G-04: O índice pode ser reconstruído a partir das mensagens originais.

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| 🟡 Mensagens indexadas em até 60 s após gravação (texto) | n/a | ≥ 99% | v0.1 |
| 🟡 `KnowledgeItem`s sem evidência | n/a | 0 | v0.1 |
| 🟡 Tempo de reindexação completa de 100.000 mensagens | n/a | ≤ 2 h | v0.1 |

---

## 4. Non-Goals (Fora do Escopo)

- 🟡 NG-01: Knowledge graph de entidades e relações (fora da v0.1).
- 🟡 NG-02: Classificação automática de todas as mensagens em tópicos; na v0.1 só há temas atribuídos pelo usuário ao guardar.
- 🟡 NG-03: Extração automática de decisões, recomendações e ferramentas (fase seguinte).
- 🟡 NG-04: Banco vetorial separado; os vetores ficam no PostgreSQL (pgvector).

---

## 5. Usuários e Personas

**Usuário primário:** 🟡 P1, que guarda conteúdos por tema e pesquisa a base.
**Usuário secundário:** 🟡 Componentes `retrieval` e `conversational-agent`.

**Jornada atual (sem a feature):**
🟡 O usuário salva mensagens com estrela no WhatsApp, sem tema nem busca por assunto.

**Jornada futura (com a feature):**
1. 🟡 O usuário encaminha um conteúdo ao agente: "guarda isso em arquitetura de software".
2. 🟡 O sistema indexa o conteúdo e cria um `KnowledgeItem` do tipo `saved` com o tema.
3. 🟡 Depois, o usuário pergunta "o que guardei sobre arquitetura?" e recebe os itens com a origem.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | 🟡 O sistema deve gerar o texto indexável da mensagem: texto, transcrição ativa e URLs, normalizados (minúsculas, sem acentos para trigramas). | Must | 🟡 Mensagem de áudio é encontrada por palavra falada após a transcrição. |
| RF-02 | 🟡 O sistema deve manter índice de texto completo em português e índice de trigramas por `space_id`. | Must | 🟡 Busca por "kubernetes" e por "kubernets" (erro de digitação) encontram a mesma mensagem. |
| RF-03 | 🟡 O sistema deve dividir textos longos em trechos de até 512 tokens com sobreposição de 64 e gerar um embedding por trecho. | Must | 🟡 Transcrição de 3.000 tokens gera ≥ 6 trechos, cada um ligado à mensagem e aos segmentos de tempo correspondentes. |
| RF-04 | 🟡 O sistema deve registrar modelo e dimensão do embedding em cada trecho. | Must | 🟡 Trocar o modelo de embedding marca os trechos antigos para reindexação. |
| RF-05 | 🟡 O sistema deve criar `KnowledgeItem` (`saved`) quando o agente pedir "guardar", com `theme`, nota opcional e `EvidenceReference` para a mensagem guardada. | Must | 🟡 Item criado aparece na listagem por tema com link para a mensagem. |
| RF-06 | 🟡 O sistema deve normalizar temas (minúsculas, sem acento, espaços colapsados) e reutilizar tema existente equivalente. | Should | 🟡 "Arquitetura de Software" e "arquitetura de software" resultam no mesmo tema. |
| RF-07 | 🟡 O sistema deve recusar `KnowledgeItem` sem ao menos uma `EvidenceReference`. | Must | 🟡 Tentativa de criar item sem evidência retorna erro. |
| RF-08 | 🟡 O sistema deve permitir reconstruir todo o índice de um espaço a partir das mensagens e transcrições ativas. | Should | 🟡 Apagar o índice e reconstruir reproduz os mesmos resultados de busca no conjunto de avaliação. |
| RF-09 | 🟡 O sistema deve remover do índice trechos e itens de mensagens excluídas, na mesma cascata da exclusão de fonte. | Must | 🟡 Após excluir a fonte, nenhuma busca retorna seus trechos. |

### 6.2 Fluxo Principal (Happy Path)

1. 🟡 A ingestão (ou a transcrição) publica `knowledge.index` para uma mensagem.
2. 🟡 O sistema monta o texto indexável e atualiza os índices de texto completo e trigramas.
3. 🟡 O sistema divide em trechos e gera os embeddings.
4. 🟡 O sistema grava os trechos com `space_id`, mensagem e faixa de tempo (para áudio).
5. 🟡 Resultado: a mensagem fica disponível para `retrieval`.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Guardar com tema:**
1. 🟡 O agente identifica a intenção "guardar" e chama a indexação com a mensagem encaminhada e o tema.
2. 🟡 O sistema indexa a mensagem (fonte especial "Guardados" do espaço) e cria o `KnowledgeItem`.

**Fluxo Alternativo B — Troca de modelo de embedding:**
1. 🟡 O operador configura um novo modelo; o sistema reindexa em segundo plano e só troca o índice ativo ao concluir.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | 🟡 Performance | 🟡 P95 ≤ 60 s da gravação ao índice (texto) | 🟡 Embeddings locais ou provedor configurado. |
| RNF-02 | 🟡 Custo | 🟡 Embeddings locais por padrão | 🟡 Provedor pago só por configuração. |
| RNF-03 | 🟡 Isolamento | 🟡 Todo trecho carrega `space_id` | 🟡 Base do filtro prévio de `retrieval`. |

---

## 8. Design e Interface

**Componentes afetados:** 🟡 Worker `knowledge.index`, tabelas de trechos e itens, interface `Embedder`.

**Comportamento esperado:**
🟡 O gerador de embeddings fica atrás da interface `Embedder`, trocável por configuração.

**Estados da UI:**
- 🟡 Estado vazio: "Você ainda não guardou nada sobre este tema."
- 🟡 Estado de carregamento: mensagem recém-chegada ainda não indexada não aparece na busca (sem estado visível).
- 🟡 Estado de erro: falha de indexação registrada e reprocessada; o usuário não é notificado.
- 🟡 Estado de sucesso: "Guardei em <tema>."

---

## 9. Modelo de Dados

```
MessageChunk { id: uuid, space_id: uuid, message_id: uuid, idx: int, text: text,
               tsv: tsvector, embedding: vector(n), embed_model: text,
               audio_start_s: numeric?, audio_end_s: numeric? }
KnowledgeItem { id: uuid, space_id: uuid, kind: enum(saved, summary), theme_id: uuid?, title: text?,
                note: text?, created_by: enum(user, agent), created_at: timestamptz }
EvidenceReference { knowledge_item_id: uuid, message_id: uuid, chunk_id: uuid? }
Theme { id: uuid, space_id: uuid, name: text, normalized: text }
```

**Migrações necessárias:** 🟡 Sim; extensões `pg_trgm` e `vector`.

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| 🟡 PostgreSQL com `pg_trgm` e `pgvector` | Obrigatória | 🟡 Indexação para; jobs aguardam em retry. |
| 🟡 Modelo de embeddings (local ou provedor) | Obrigatória | 🟡 Indexa texto completo e trigramas; embeddings ficam pendentes e são gerados depois. |
| 🟡 `media-transcription` | Opcional | 🟡 Áudios indexados apenas após a transcrição. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| 🟡 EC-01: Falha ou timeout do embedder | 🟡 Modelo indisponível | 🟡 Gravar índices textuais e marcar trechos `embedding_pending` para retry. |
| 🟡 EC-02: Mensagem sem texto (imagem sem legenda) | 🟡 Nada a indexar | 🟡 Não criar trechos; mensagem segue acessível por filtros de autor/data. |
| 🟡 EC-03: Guardar sem tema | 🟡 "guarda isso" sem tema | 🟡 Agente pergunta o tema; sem resposta em 10 min, guardar no tema "sem tema". |
| 🟡 EC-04: Mensagem com texto muito longo (> 50.000 caracteres) | 🟡 Documento colado | 🟡 Indexar até 50.000 caracteres e registrar truncamento. |
| 🟡 EC-05: Dimensão de embedding divergente | 🟡 Modelo trocado sem reindexar | 🟡 Recusar gravação com erro de configuração. |

---

## 12. Segurança e Privacidade

- **Autenticação:** 🟡 Workers internos.
- **Autorização:** 🟡 Todo registro carrega `space_id`; nenhuma consulta sem esse filtro.
- **Dados sensíveis:** 🟡 Trechos e embeddings derivam de conteúdo privado; com provedor externo de embeddings, o texto sai da máquina, por isso o padrão é local.
- **Auditoria:** 🟡 Registrar criação e exclusão de `KnowledgeItem`.

---

## 13. Plano de Rollout

- **Estratégia:** 🟡 Habilitado na v0.1; validar com o conjunto de avaliação de 30 perguntas.
- **Como reverter (rollback):** 🟡 Reconstruir o índice a partir das mensagens (RF-08).
- **Monitoramento pós-deploy:** 🟡 Atraso de indexação, trechos com embedding pendente.

---

## 14. Open Questions

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | 🟡 Qual modelo de embeddings multilíngue local atende pt-BR com qualidade suficiente? | Alto | Leandro | Experimento |
| OQ-02 | 🟡 Resumos gerados pelo agente devem virar `KnowledgeItem` (`summary`) persistido ou ser descartados? (adotado: persistir apenas quando o usuário pedir para guardar) | Baixo | Leandro | v0.1 |

---

## 15. Decisões Tomadas (Decision Log)

| Decisão | Alternativas consideradas | Racional |
|---------|--------------------------|---------|
| 🟡 PostgreSQL FTS + pg_trgm + pgvector | 🟡 Banco vetorial dedicado | 🟡 Menos infraestrutura; restrição do PRD. |
| 🟡 Evidência obrigatória em `KnowledgeItem` | 🟡 Itens livres | 🟡 Evidence over hallucination. |

---

## Apêndice

### Referências
- 🟡 `_reversa_sdd/prd.md` seções 4, 5, 6

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
