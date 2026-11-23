# Spec: ingestion

**Versão:** 1.0
**Status:** Rascunho
**Autor:** reversa-spec-sdd
**Data:** 2026-11-22
**Reviewers:** N/A

> Selo 🟡 PLANEJADO em todos os itens. Fonte: `_reversa_sdd/prd.md`.

---

## 1. Resumo

🟡 Recebe `CanonicalMessage`s de qualquer adaptador, verifica a autorização da fonte, grava as mensagens originais como evidência imutável de forma idempotente, reconcilia mensagens capturadas ao vivo com mensagens importadas e dispara os processamentos seguintes (mídia, transcrição, indexação).

---

## 2. Contexto e Motivação

**Problema:**
🟡 A mesma mensagem pode chegar mais de uma vez (reentrega na reconexão, reimportação, sobreposição entre captura e exportação). Sem idempotência e reconciliação, a busca devolve duplicatas e as métricas de captura ficam erradas.

**Evidências:**
🟡 PRD seção 4 (ingestão idempotente), seção 8 (risco de duplicação com probabilidade alta) e pendência "regra de reconciliação entre mensagens capturadas e importadas".

**Por que agora:**
🟡 É a porta única de entrada do núcleo; todos os demais componentes leem o que ela grava.

---

## 3. Goals (Objetivos)

- [ ] 🟡 G-01: Cada mensagem real fica gravada exatamente uma vez por fonte.
- [ ] 🟡 G-02: Nenhuma mensagem de fonte não autorizada é gravada.
- [ ] 🟡 G-03: Toda mensagem gravada preserva proveniência (adaptador, método de captura, horário de captura).
- [ ] 🟡 G-04: Toda mensagem gravada dispara os processamentos seguintes.

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| 🟡 Duplicatas no corpus de teste (captura + importação sobrepostas) | n/a | 0 | v0.1 |
| 🟡 Vazão de ingestão de mensagens de texto | n/a | ≥ 200 msg/s | v0.1 |
| 🟡 Mensagens gravadas sem job de indexação disparado | n/a | 0 | v0.1 |

---

## 4. Non-Goals (Fora do Escopo)

- 🟡 NG-01: Processar edições e exclusões vindas do provedor (ver OQ-01 de `channel-contract`).
- 🟡 NG-02: Unificar identidades de autores entre canais diferentes.
- 🟡 NG-03: Classificar ou interpretar o conteúdo (feito por `knowledge-indexing`).
- 🟡 NG-04: Mensageria distribuída (Kafka); a v0.1 usa fila de jobs local.

---

## 5. Usuários e Personas

**Usuário primário:** 🟡 Componentes internos (adaptadores produtores e workers consumidores).
**Usuário secundário:** 🟡 P1 e P2, que percebem o resultado: busca sem duplicatas e com origem correta.

**Jornada atual (sem a feature):**
🟡 Não existe base; cada fonte gravaria do seu jeito, com duplicatas.

**Jornada futura (com a feature):**
1. 🟡 Um adaptador entrega mensagens.
2. 🟡 A ingestão grava cada uma uma única vez, com proveniência.
3. 🟡 Os workers transcrevem e indexam automaticamente.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | 🟡 O sistema deve resolver `Source` e `KnowledgeSpace` a partir de (`provider`, `accountId`, `conversationId`) e rejeitar mensagens de fontes não `authorized`. | Must | 🟡 Mensagem de fonte não autorizada não gera registro e incrementa `ingestion_rejected_total{reason="not_authorized"}`. |
| RF-02 | 🟡 O sistema deve deduplicar mensagens com `externalMessageId` pela chave única (`source_id`, `external_message_id`). | Must | 🟡 Entregar a mesma mensagem 3 vezes resulta em 1 registro. |
| RF-03 | 🟡 O sistema deve deduplicar mensagens importadas pela chave de importação determinística (`source_id`, `import_key`). | Must | 🟡 Reimportar o mesmo ZIP resulta em zero registros novos. |
| RF-04 | 🟡 O sistema deve reconciliar importadas com capturadas ao vivo: considera a mesma mensagem quando fonte e autor coincidem, o conteúdo normalizado é igual e a diferença de horário é ≤ 60 s. | Must | 🟡 Mensagem capturada ao vivo e depois importada fica com 1 registro e duas proveniências. |
| RF-05 | 🟡 O sistema deve gravar `Message` como evidência imutável: conteúdo original, autor, timestamp, ids externos e lista de proveniências. | Must | 🟡 Não existe operação de atualização do conteúdo de `Message`; só inclusão de proveniência ou exclusão em cascata. |
| RF-06 | 🟡 O sistema deve registrar `Participant` por fonte a partir de `sender.externalId` e atualizar o nome exibido mais recente. | Must | 🟡 Mensagens do mesmo `externalId` apontam para o mesmo `Participant`. |
| RF-07 | 🟡 O sistema deve enfileirar jobs seguintes na mesma transação da gravação (outbox): `media.store` para anexos e `knowledge.index` para toda mensagem. | Must | 🟡 Falha após a gravação não perde o disparo; o job é publicado na retomada. |
| RF-08 | 🟡 O sistema deve aceitar lotes de até 1.000 mensagens por chamada. | Should | 🟡 Lote de 1.000 é gravado em transação única por fonte. |
| RF-09 | 🟡 O sistema deve expor métricas de mensagens aceitas, duplicadas, reconciliadas e rejeitadas por fonte e método de captura. | Must | 🟡 Métricas disponíveis no Prometheus com esses rótulos. |

### 6.2 Fluxo Principal (Happy Path)

1. 🟡 O adaptador entrega um `CanonicalMessage` validado pelo contrato.
2. 🟡 O sistema resolve a fonte e confirma que está autorizada.
3. 🟡 O sistema verifica duplicidade pela chave aplicável.
4. 🟡 O sistema grava `Message`, `Participant`, `Attachment` e proveniência em uma transação com o outbox.
5. 🟡 O sistema publica os jobs de mídia e indexação.
6. 🟡 Resultado: mensagem gravada uma vez e processamento disparado.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Duplicata exata:**
1. 🟡 A chave já existe; o sistema não grava nada novo e incrementa `ingestion_duplicates_total`.

**Fluxo Alternativo B — Reconciliação captura × importação:**
1. 🟡 Chega uma mensagem importada sem `externalMessageId`.
2. 🟡 O sistema encontra uma mensagem ao vivo que atende à regra do RF-04 e adiciona a proveniência `export_import` a ela.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | 🟡 Performance | 🟡 ≥ 200 msg/s de texto | 🟡 Máquina local. |
| RNF-02 | 🟡 Consistência | 🟡 Gravação e outbox na mesma transação | 🟡 Sem perda de disparos. |
| RNF-03 | 🟡 Isolamento | 🟡 Todo registro carrega `space_id` | 🟡 Pré-requisito do filtro de `retrieval`. |

---

## 8. Design e Interface

**Componentes afetados:** 🟡 Serviço de ingestão (módulo do monólito), tabelas de mensagens, outbox e fila de jobs.

**Comportamento esperado:**
🟡 API interna `ingest(messages[])` retorna, por mensagem, `accepted`, `duplicate`, `reconciled` ou `rejected` com motivo.

**Estados da UI:**
- 🟡 Estado vazio: não se aplica (componente interno).
- 🟡 Estado de carregamento: não se aplica.
- 🟡 Estado de erro: resultado `rejected` com motivo (`not_authorized`, `invalid`, `source_deleting`).
- 🟡 Estado de sucesso: resultado `accepted` ou `reconciled` com o id interno.

---

## 9. Modelo de Dados

```
Message { id: uuid, space_id: uuid, source_id: uuid, participant_id: uuid,
          external_message_id: text?, import_key: text?, kind: text, text: text?,
          quoted_message_id: uuid?, is_forwarded: bool, sent_at: timestamptz, created_at: timestamptz }
MessageProvenance { message_id: uuid, capture_method: text, adapter: text, captured_at: timestamptz }
Participant { id: uuid, source_id: uuid, external_id: text, display_name: text? }
Attachment { id: uuid, message_id: uuid, mime_type: text, size_bytes: bigint?, storage_key: text?,
             status: enum(pending, stored, unavailable) }
Outbox { id: bigserial, job_type: text, payload: jsonb, published_at: timestamptz? }
```

🟡 Índices únicos parciais: (`source_id`, `external_message_id`) e (`source_id`, `import_key`).

**Migrações necessárias:** 🟡 Sim, criação inicial.

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| 🟡 PostgreSQL | Obrigatória | 🟡 Ingestão recusa e o adaptador mantém buffer e retry. |
| 🟡 Fila de jobs (BullMQ/Redis ou fila em PostgreSQL) | Obrigatória | 🟡 Outbox acumula e publica na retomada. |
| 🟡 `identity-and-sources` | Obrigatória | 🟡 Sem consulta de autorização, a ingestão recusa (falha fechada). |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| 🟡 EC-01: Duas mensagens idênticas legítimas no mesmo minuto | 🟡 Autor envia "ok" duas vezes | 🟡 Na importação, o ordinal na chave mantém as duas; na reconciliação, casar uma a uma por ordem. |
| 🟡 EC-02: Fonte entra em exclusão durante a ingestão | 🟡 Status `deleting` | 🟡 Rejeitar com motivo `source_deleting`. |
| 🟡 EC-03: Falha do banco no meio de um lote | 🟡 Timeout ou conexão perdida | 🟡 Rollback do lote inteiro e retorno de erro para retry do produtor. |
| 🟡 EC-04: Mensagem citada ainda não ingerida | 🟡 `quotedExternalMessageId` desconhecido | 🟡 Gravar com `quoted_message_id` nulo e resolver quando a citada chegar. |
| 🟡 EC-05: Timestamp no futuro (> 5 min) | 🟡 Relógio do provedor errado | 🟡 Gravar com `sent_at` do provedor e marcar métrica de anomalia. |

---

## 12. Segurança e Privacidade

- **Autenticação:** 🟡 API interna, acessível só por processos do próprio sistema.
- **Autorização:** 🟡 Verificação de fonte autorizada em toda mensagem (RF-01).
- **Dados sensíveis:** 🟡 Conteúdo das mensagens é PII; criptografia em repouso do banco; nenhum corpo em logs.
- **Auditoria:** 🟡 Contadores por motivo de rejeição; sem log de conteúdo.

---

## 13. Plano de Rollout

- **Estratégia:** 🟡 Big bang na v0.1, validado com corpus de teste de sobreposição captura × importação.
- **Como reverter (rollback):** 🟡 Migrações reversíveis; dados de teste descartáveis.
- **Monitoramento pós-deploy:** 🟡 Taxa de duplicatas, reconciliações, rejeições e tamanho do outbox pendente.

---

## 14. Open Questions

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | 🟡 A janela de 60 s da reconciliação é suficiente, dado que a exportação mostra só hora e minuto? | Médio | Leandro | Experimento |
| OQ-02 | 🟡 Fila de jobs em Redis (BullMQ) ou em PostgreSQL para reduzir infraestrutura local? | Baixo | Leandro | v0.1 |

---

## 15. Decisões Tomadas (Decision Log)

| Decisão | Alternativas consideradas | Racional |
|---------|--------------------------|---------|
| 🟡 Mensagem imutável com múltiplas proveniências | 🟡 Um registro por captura | 🟡 Evidência única e rastreável; separa evidência de interpretação. |
| 🟡 Outbox transacional | 🟡 Publicar na fila após o commit | 🟡 Garante disparo sem perda. |

---

## Apêndice

### Referências
- 🟡 `_reversa_sdd/prd.md` seções 4, 8 e pendências de cobertura
- 🟡 `_reversa_sdd/sdd/channel-contract.md`, `_reversa_sdd/sdd/whatsapp-export-importer.md`

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
