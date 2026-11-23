# Spec: channel-contract

**Versão:** 1.0
**Status:** Rascunho
**Autor:** reversa-spec-sdd
**Data:** 2026-11-22
**Reviewers:** N/A

> Selo 🟡 PLANEJADO em todos os itens. Fonte: `_reversa_sdd/prd.md`.

---

## 1. Resumo

🟡 Define o contrato entre o núcleo do Palantír e qualquer canal de mensagens: a interface `KnowledgeChannel`, o evento `CanonicalMessage`, o formato neutro de resposta `AgentReply` e a suíte de testes de contrato que todo adaptador precisa passar. É a peça que garante "WhatsApp-first, not WhatsApp-only".

---

## 2. Contexto e Motivação

**Problema:**
🟡 A captura inicial usa Baileys, integração não oficial sujeita a quebra e bloqueio. Se o núcleo depender de tipos do Baileys ou do WhatsApp, trocar a integração (Cloud API oficial, Telegram, importação) exige reconstruir a base de conhecimento.

**Evidências:**
🟡 PRD seção 4 (contrato canônico e interface de canal), seção 6 (WhatsApp como adaptador substituível) e seção 8 (risco alto de instabilidade do Baileys).

**Por que agora:**
🟡 É o primeiro contrato a estabilizar: ingestão, agente e todos os adaptadores são escritos contra ele (API first).

---

## 3. Goals (Objetivos)

- [ ] 🟡 G-01: O núcleo compila e passa nos testes sem nenhuma dependência de pacotes de adaptadores.
- [ ] 🟡 G-02: Todo adaptador passa a mesma suíte de testes de contrato.
- [ ] 🟡 G-03: Um novo provedor pode ser adicionado sem alterar o esquema do banco nem o núcleo.

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| 🟡 Imports de pacotes de adaptador dentro do núcleo | n/a | 0 | v0.1 |
| 🟡 Testes de contrato aprovados por adaptador | n/a | 100% | v0.1 |
| 🟡 Arquivos do núcleo alterados para criar um adaptador fake | n/a | 0 | v0.1 |

---

## 4. Non-Goals (Fora do Escopo)

- 🟡 NG-01: Implementar adaptadores concretos (ficam em `whatsapp-baileys-adapter` e `whatsapp-export-importer`).
- 🟡 NG-02: Suportar reações, enquetes, stickers, chamadas e status do WhatsApp na v0.1; esses eventos são ignorados pelo adaptador.
- 🟡 NG-03: Edição e exclusão de mensagens como eventos de primeira classe; a v0.1 só registra mensagens novas.
- 🟡 NG-04: Formatação rica (botões, listas interativas) em `AgentReply`.

---

## 5. Usuários e Personas

**Usuário primário:** 🟡 Desenvolvedores que implementam adaptadores e os componentes do núcleo (consumidores do contrato).
**Usuário secundário:** 🟡 P1 e P2, indiretamente: a estabilidade do contrato garante que a memória sobrevive à troca de integração.

**Jornada atual (sem a feature):**
🟡 Cada integração entregaria mensagens em formato próprio, e o núcleo precisaria conhecer cada uma.

**Jornada futura (com a feature):**
1. 🟡 O desenvolvedor implementa `KnowledgeChannel` para um novo provedor.
2. 🟡 O desenvolvedor executa a suíte de contrato contra o adaptador.
3. 🟡 Com a suíte verde, o adaptador é registrado e o núcleo passa a receber `CanonicalMessage` dele.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | 🟡 O sistema deve definir a interface `KnowledgeChannel` com `connect`, `disconnect`, `listConversations`, `onMessage`, `sendReply` e `fetchMedia`. | Must | 🟡 Adaptador fake implementando a interface compila e é aceito pelo registro de canais. |
| RF-02 | 🟡 O sistema deve definir `CanonicalMessage` com `source.provider` como texto livre e `provenance.captureMethod` (`live`, `export_import`, `forwarded_to_agent`). | Must | 🟡 Validação aceita `provider="telegram"` sem alteração de código; rejeita `captureMethod` fora da lista. |
| RF-03 | 🟡 O sistema deve validar todo `CanonicalMessage` recebido por esquema (JSON Schema publicado) antes de entregá-lo à ingestão. | Must | 🟡 Mensagem sem `timestamp`, `source.conversationId` ou `kind` é rejeitada com erro de validação identificando o campo. |
| RF-04 | 🟡 O sistema deve definir `AgentReply` neutro: texto em Markdown restrito (negrito, itálico, listas), lista de citações estruturadas e anexos opcionais. | Must | 🟡 O núcleo produz `AgentReply` sem conhecer limites de tamanho ou sintaxe do canal. |
| RF-05 | 🟡 O sistema deve delegar ao adaptador a renderização de `AgentReply` para o canal (formatação, divisão em partes, limite de tamanho). | Must | 🟡 Resposta de 10.000 caracteres é entregue pelo adaptador fake em partes dentro do limite que ele declara. |
| RF-06 | 🟡 O sistema deve expor uma declaração de capacidades por adaptador (`supportsLiveCapture`, `supportsHistory`, `supportsMedia`, `maxMessageLength`). | Should | 🟡 O núcleo consulta as capacidades e não chama operações não suportadas. |
| RF-07 | 🟡 O sistema deve fornecer uma suíte de testes de contrato reutilizável, executada contra cada adaptador. | Must | 🟡 Suíte cobre conexão, recebimento, envio, mídia e reconexão; adaptador fake passa 100%. |
| RF-08 | 🟡 O sistema deve versionar o contrato (`contractVersion` semver) e rejeitar mensagens de versão maior incompatível. | Should | 🟡 Mensagem com `contractVersion` 2.x é rejeitada por núcleo 1.x com erro explícito. |
| RF-09 | 🟡 O sistema deve incluir no `CanonicalMessage` a referência a mensagem citada (`quotedExternalMessageId`) e indicação de encaminhamento (`isForwarded`). | Should | 🟡 Mensagem de resposta a outra preserva o id externo citado. |

### 6.2 Fluxo Principal (Happy Path)

1. 🟡 O registro de canais instancia o adaptador configurado e chama `connect`.
2. 🟡 O adaptador recebe uma mensagem do provedor e a converte em `CanonicalMessage`.
3. 🟡 O sistema valida a mensagem pelo esquema e a entrega à ingestão via handler de `onMessage`.
4. 🟡 O agente produz um `AgentReply` e o sistema chama `sendReply` do adaptador de origem.
5. 🟡 Resultado: o usuário recebe a resposta formatada para o seu canal.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Mídia sob demanda:**
1. 🟡 A ingestão recebe um `CanonicalMessage` com anexo ainda não baixado.
2. 🟡 O sistema chama `fetchMedia` do adaptador e grava o binário no object storage.

**Fluxo Alternativo B — Mensagem inválida:**
1. 🟡 A validação falha; o sistema descarta a mensagem, registra o erro com o campo inválido e incrementa a métrica `channel_invalid_messages_total`.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | 🟡 Performance | 🟡 Validação de esquema P95 < 5 ms por mensagem | 🟡 Em processo. |
| RNF-02 | 🟡 Compatibilidade | 🟡 Mudanças aditivas não quebram adaptadores | 🟡 Campos novos são opcionais. |
| RNF-03 | 🟡 Arquitetura | 🟡 Zero dependências do núcleo para adaptadores | 🟡 Verificado pelo teste de arquitetura de `platform-foundation`. |

---

## 8. Design e Interface

**Componentes afetados:** 🟡 Pacote de contrato compartilhado (`KnowledgeChannel`, `CanonicalMessage`, `AgentReply`, JSON Schemas, suíte de contrato); registro de canais.

**Comportamento esperado:**
🟡 O contrato é publicado como pacote sem dependências de runtime de provedores. O JSON Schema é a fonte da verdade e os tipos são gerados ou verificados a partir dele.

**Estados da UI:**
- 🟡 Estado vazio: não se aplica (componente sem interface de usuário).
- 🟡 Estado de carregamento: não se aplica.
- 🟡 Estado de erro: erro de validação com caminho do campo (ex.: `source.conversationId: required`).
- 🟡 Estado de sucesso: mensagem entregue ao handler de ingestão.

---

## 9. Modelo de Dados

```
CanonicalMessage {
  contractVersion: string            // semver, ex. "1.0.0"
  id: string                         // uuid gerado pelo adaptador
  source: { provider: string, accountId: string, conversationId: string, externalMessageId?: string }
  sender: { externalId: string, displayName?: string }
  timestamp: string                  // ISO 8601 com fuso
  kind: "text" | "audio" | "image" | "document" | "link"
  text?: string
  quotedExternalMessageId?: string
  isForwarded: boolean
  attachments: Array<{ id: string, mimeType: string, sizeBytes?: number, storageKey?: string, fetchRef?: string }>
  provenance: { captureMethod: "live" | "export_import" | "forwarded_to_agent", capturedAt: string, adapter: string }
}
AgentReply {
  text: string
  citations: Array<{ messageId: string, author: string, conversationTitle: string, timestamp: string }>
  attachments?: Array<{ storageKey: string, mimeType: string }>
}
```

🟡 `externalMessageId` é opcional porque o arquivo exportado do WhatsApp não o fornece (ver `ingestion`).

**Migrações necessárias:** 🟡 Não (contrato em código, sem tabela própria).

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| 🟡 Biblioteca de validação de JSON Schema | Obrigatória | 🟡 Sem validação, mensagens não são aceitas (falha fechada). |
| 🟡 `ingestion` (handler de `onMessage`) | Obrigatória | 🟡 Adaptador mantém a mensagem em buffer local e reentrega; ver EC-03. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| 🟡 EC-01: Tipo de mensagem não suportado | 🟡 Reação, enquete, sticker | 🟡 Adaptador descarta e incrementa `channel_ignored_events_total{type}`; não chega ao núcleo. |
| 🟡 EC-02: Versão de contrato incompatível | 🟡 `contractVersion` maior | 🟡 Rejeitar com erro explícito e alerta de configuração. |
| 🟡 EC-03: Falha do handler de ingestão | 🟡 Timeout ou exceção | 🟡 Retry com backoff (3 tentativas); depois, mensagem vai para fila de mensagens mortas com motivo. |
| 🟡 EC-04: Resposta maior que o limite do canal | 🟡 `AgentReply.text` > `maxMessageLength` | 🟡 Adaptador divide em partes numeradas sem cortar citações. |
| 🟡 EC-05: Timestamp sem fuso | 🟡 Provedor envia horário local | 🟡 Rejeitar na validação; adaptador é responsável por normalizar para ISO 8601 com fuso. |

---

## 12. Segurança e Privacidade

- **Autenticação:** 🟡 Não se aplica ao contrato; adaptadores autenticam no provedor.
- **Autorização:** 🟡 O contrato não decide autorização; a ingestão consulta `identity-and-sources`.
- **Dados sensíveis:** 🟡 `CanonicalMessage` contém PII e conteúdo privado; nunca registrar o corpo em logs, apenas ids.
- **Auditoria:** 🟡 Logs registram `id`, `provider`, `captureMethod` e resultado da validação.

---

## 13. Plano de Rollout

- **Estratégia:** 🟡 Publicar o contrato 1.0.0 antes de qualquer adaptador.
- **Como reverter (rollback):** 🟡 Mudanças só aditivas; quebra exige nova versão maior e convivência de versões.
- **Monitoramento pós-deploy:** 🟡 `channel_invalid_messages_total` e `channel_ignored_events_total` por adaptador.

---

## 14. Open Questions

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | 🟡 Edição e exclusão de mensagens no provedor devem refletir na base na fase seguinte? | Médio | Leandro | Fase seguinte |
| OQ-02 | 🟡 `link` deve ser `kind` próprio ou metadado extraído de mensagens `text`? (adotado: `kind` próprio quando a mensagem é só um link) | Baixo | Leandro | v0.1 |

---

## 15. Decisões Tomadas (Decision Log)

| Decisão | Alternativas consideradas | Racional |
|---------|--------------------------|---------|
| 🟡 `provider` texto livre | 🟡 Enum `whatsapp/telegram/import` do Blueprint | 🟡 Extensível; importação não é provedor. |
| 🟡 Importação como `captureMethod` | 🟡 Importação como `provider` | 🟡 Um ZIP do WhatsApp continua sendo conversa do WhatsApp; permite deduplicar com captura ao vivo. |
| 🟡 `AgentReply` neutro com renderização no adaptador | 🟡 Núcleo formata para WhatsApp | 🟡 Mantém o núcleo independente do canal. |

---

## Apêndice

### Referências
- 🟡 `_reversa_sdd/prd.md` seções 4, 6, 8
- 🟡 `ChatGPT-Ideacao.md` (interface `KnowledgeChannel` e `CanonicalMessage` do Blueprint v0.1)

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
