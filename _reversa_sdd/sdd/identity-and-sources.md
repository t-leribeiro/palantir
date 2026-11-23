# Spec: identity-and-sources

**Versão:** 1.0
**Status:** Rascunho
**Autor:** reversa-spec-sdd
**Data:** 2026-11-22
**Reviewers:** N/A

> Selo 🟡 PLANEJADO em todos os itens. Fonte: `_reversa_sdd/prd.md`.

---

## 1. Resumo

🟡 Gerencia quem é o usuário do Palantír, quais contas de canal ele vinculou (WhatsApp é apenas um dos tipos), qual é o seu espaço de conhecimento (`KnowledgeSpace`) e quais fontes (conversas e grupos) ele autorizou a indexar. Também controla retenção e exclusão de fontes com todos os dados derivados.

---

## 2. Contexto e Motivação

**Problema:**
🟡 O produto captura conversas de terceiros. Sem um controle explícito de quem é o dono de cada dado, de quais conversas foram autorizadas e de como apagá-las, o produto expõe dados privados e viola o princípio "privado por padrão" do PRD.

**Evidências:**
🟡 PRD seção 4 (opt-in por conversa, isolamento, exclusão, retenção) e seção 8 (risco de exposição de dados de terceiros, impacto alto).

**Por que agora:**
🟡 Todos os demais componentes dependem de um `KnowledgeSpace` e de fontes autorizadas para gravar e consultar dados. É a fundação do isolamento.

---

## 3. Goals (Objetivos)

- [ ] 🟡 G-01: Toda mensagem armazenada pertence a exatamente um `KnowledgeSpace` e a uma fonte autorizada.
- [ ] 🟡 G-02: Nenhuma conversa é capturada sem opt-in explícito do usuário.
- [ ] 🟡 G-03: O usuário consegue excluir uma fonte e todos os dados derivados dela.
- [ ] 🟡 G-04: O modelo suporta contas de canal de qualquer provedor, sem campos específicos do WhatsApp no núcleo.

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| 🟡 Mensagens gravadas de conversas sem opt-in | n/a | 0 | v0.1 |
| 🟡 Dados derivados remanescentes após exclusão de fonte | n/a | 0 registros | v0.1 |
| 🟡 Tempo para concluir a exclusão de uma fonte | n/a | ≤ 5 min | v0.1 |

---

## 4. Non-Goals (Fora do Escopo)

- 🟡 NG-01: Espaços de conhecimento compartilhados entre múltiplos usuários (persona P3, fase seguinte). O modelo apenas prevê o campo de tipo do espaço.
- 🟡 NG-02: Interface web de cadastro e gestão; na v0.1 a gestão é feita por comandos ao agente e por API/CLI.
- 🟡 NG-03: Autenticação federada (SSO, OAuth) e planos pagos.
- 🟡 NG-04: Papéis e permissões granulares dentro de um espaço.

---

## 5. Usuários e Personas

**Usuário primário:** 🟡 P1 (profissional conectado) e P2 (gestor/consultor), donos de um espaço pessoal.
**Usuário secundário:** 🟡 Operador do sistema (o próprio idealizador na v0.1), que provisiona usuários e contas de canal.

**Jornada atual (sem a feature):**
🟡 Não existe controle: qualquer conversa acessível ao número seria capturada, sem dono, retenção ou exclusão.

**Jornada futura (com a feature):**
1. 🟡 O usuário é cadastrado e recebe um espaço pessoal.
2. 🟡 O usuário vincula sua conta de canal por verificação.
3. 🟡 O usuário lista as conversas disponíveis e autoriza as que quer indexar.
4. 🟡 O usuário pode revogar a autorização ou excluir uma fonte a qualquer momento.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | 🟡 O sistema deve criar um `KnowledgeSpace` do tipo `personal` ao cadastrar um usuário. | Must | 🟡 Após cadastro, existe exatamente 1 espaço `personal` com `owner_user_id` igual ao usuário. |
| RF-02 | 🟡 O sistema deve permitir vincular uma `ChannelAccount` identificada por `provider` (texto livre) e `external_account_id`. | Must | 🟡 Vincular conta `provider=whatsapp` e outra `provider=telegram` funciona sem mudança de esquema. |
| RF-03 | 🟡 O sistema deve exigir verificação de posse da conta de canal antes de ativá-la (código de uso único enviado pelo canal, válido por 10 min). | Must | 🟡 Conta fica `pending` até o código correto; código expirado ou errado mantém `pending`. |
| RF-04 | 🟡 O sistema deve registrar cada conversa conhecida como `Source` com status `not_authorized` por padrão. | Must | 🟡 Conversa recém-descoberta tem status `not_authorized` e nenhuma mensagem dela é gravada. |
| RF-05 | 🟡 O usuário deve poder autorizar e revogar uma `Source`. | Must | 🟡 Após autorizar, mensagens passam a ser aceitas; após revogar, novas mensagens são descartadas. |
| RF-06 | 🟡 O sistema deve expor a consulta "a fonte X do espaço Y está autorizada?" para os demais componentes. | Must | 🟡 Consulta retorna verdadeiro somente para fontes `authorized` do espaço informado. |
| RF-07 | 🟡 O usuário deve poder excluir uma `Source`, e o sistema deve apagar mensagens, anexos, transcrições, embeddings e `KnowledgeItem`s derivados dela. | Must | 🟡 Após exclusão, consultas por qualquer dado da fonte retornam zero resultados e os objetos de mídia não existem no storage. |
| RF-08 | 🟡 O usuário deve poder configurar a retenção do espaço em dias (padrão: sem expiração). | Should | 🟡 Mensagens mais antigas que a retenção são apagadas pelo job diário com seus derivados. |
| RF-09 | 🟡 O sistema deve resolver o usuário a partir de (`provider`, `external_account_id`) do remetente de uma mensagem ao agente. | Must | 🟡 Mensagem de conta vinculada e ativa resolve o usuário; conta desconhecida resolve "nenhum usuário". |
| RF-10 | 🟡 O sistema deve registrar em log de auditoria vinculações, autorizações, revogações e exclusões. | Should | 🟡 Cada ação gera um evento com usuário, ação, alvo e timestamp. |

### 6.2 Fluxo Principal (Happy Path)

1. 🟡 O operador cadastra o usuário; o sistema cria o espaço `personal`.
2. 🟡 O usuário envia ao agente o pedido de vínculo; o sistema envia um código de verificação pelo canal.
3. 🟡 O usuário responde com o código; o sistema ativa a `ChannelAccount`.
4. 🟡 O usuário pede a lista de conversas; o sistema lista as `Source`s descobertas com status.
5. 🟡 O usuário autoriza uma conversa; o sistema muda o status para `authorized` e registra auditoria.
6. 🟡 Resultado: mensagens dessa conversa passam a ser aceitas pela ingestão.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Exclusão de fonte:**
1. 🟡 O usuário pede para excluir uma fonte; o sistema pede confirmação explícita.
2. 🟡 Após confirmação, o sistema marca a fonte como `deleting`, rejeita novas mensagens dela e enfileira a exclusão em cascata.
3. 🟡 Ao concluir, o sistema confirma ao usuário a quantidade de mensagens apagadas.

**Fluxo Alternativo B — Revogação:**
1. 🟡 O usuário revoga a autorização; o sistema para de aceitar mensagens novas e mantém o histórico até exclusão explícita.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | 🟡 Performance | 🟡 Consulta de autorização P95 < 20 ms | 🟡 Chamada em toda mensagem ingerida; pode usar cache invalidado na mudança de status. |
| RNF-02 | 🟡 Segurança | 🟡 Códigos de verificação com hash, uso único, 10 min | 🟡 Máximo de 5 tentativas por código. |
| RNF-03 | 🟡 Privacidade | 🟡 Exclusão em cascata ≤ 5 min | 🟡 Inclui objetos de mídia. |

---

## 8. Design e Interface

**Componentes afetados:** 🟡 API interna de identidade/fontes; comandos do agente ("vincular", "listar conversas", "autorizar", "revogar", "excluir fonte", "retenção").

**Comportamento esperado:**
🟡 Os comandos são expostos pelo `conversational-agent` e pela API. Exclusão sempre exige confirmação.

**Estados da UI:**
- 🟡 Estado vazio: "Nenhuma conversa autorizada ainda. Envie 'listar conversas' para começar."
- 🟡 Estado de carregamento: "Excluindo a fonte, aviso quando terminar."
- 🟡 Estado de erro: "Não consegui concluir a operação; nada foi alterado."
- 🟡 Estado de sucesso: confirmação com o nome da conversa e o novo status.

---

## 9. Modelo de Dados

```
User { id: uuid, display_name: text, created_at: timestamptz }
ChannelAccount { id: uuid, user_id: uuid, provider: text, external_account_id: text,
                 status: enum(pending, active, revoked), verified_at: timestamptz? }
KnowledgeSpace { id: uuid, owner_user_id: uuid, kind: enum(personal, shared), retention_days: int? }
Source { id: uuid, space_id: uuid, channel_account_id: uuid, external_conversation_id: text,
         title: text, kind: enum(group, direct), status: enum(not_authorized, authorized, revoked, deleting) }
AuditEvent { id: uuid, user_id: uuid, action: text, target: text, at: timestamptz }
```

🟡 Unicidade: (`provider`, `external_account_id`) em `ChannelAccount`; (`channel_account_id`, `external_conversation_id`) em `Source`.

**Migrações necessárias:** 🟡 Sim, criação inicial das tabelas.

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| 🟡 PostgreSQL | Obrigatória | 🟡 Nenhuma operação de identidade funciona; ingestão rejeita mensagens. |
| 🟡 `channel-contract` (envio do código de verificação) | Obrigatória | 🟡 Vínculo fica `pending`; usuário recebe erro ao tentar de novo. |
| 🟡 Object storage (exclusão de mídia) | Obrigatória | 🟡 Exclusão fica `deleting` e é reprocessada até concluir. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| 🟡 EC-01: Conta já vinculada a outro usuário | 🟡 Mesmo (`provider`, `external_account_id`) | 🟡 Rejeitar com "esta conta já está vinculada"; não revelar o outro usuário. |
| 🟡 EC-02: Código de verificação errado 5 vezes | 🟡 Tentativas excedidas | 🟡 Invalidar o código e exigir novo pedido de vínculo. |
| 🟡 EC-03: Falha do storage durante exclusão | 🟡 Erro ou timeout ao apagar mídia | 🟡 Manter `deleting`, retry com backoff exponencial até 24 h, depois alertar o operador. |
| 🟡 EC-04: Mensagem chega para fonte `deleting` ou `revoked` | 🟡 Captura atrasada | 🟡 Descartar a mensagem sem gravar e registrar métrica de descarte. |
| 🟡 EC-05: Remetente desconhecido fala com o agente | 🟡 Conta não vinculada | 🟡 Responder apenas com instruções de vínculo, sem acessar nenhum espaço. |

---

## 12. Segurança e Privacidade

- **Autenticação:** 🟡 Usuário identificado pela `ChannelAccount` ativa e verificada.
- **Autorização:** 🟡 Usuário só opera fontes do próprio espaço; operador provisiona usuários.
- **Dados sensíveis:** 🟡 Identificadores de conta e títulos de conversa são PII; armazenados com criptografia em repouso.
- **Auditoria:** 🟡 RF-10; eventos de auditoria não contêm conteúdo de mensagens.

---

## 13. Plano de Rollout

- **Estratégia:** 🟡 Big bang na v0.1 (uso pessoal, ambiente local).
- **Como reverter (rollback):** 🟡 Migrações reversíveis; desativar comandos de exclusão por feature flag se houver defeito.
- **Monitoramento pós-deploy:** 🟡 Métricas de mensagens descartadas por fonte não autorizada e duração das exclusões.

---

## 14. Open Questions

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | 🟡 Qual a base legal (LGPD) para armazenar mensagens de terceiros dos grupos autorizados? | Alto | Leandro | Antes de uso fora do ambiente de teste |
| OQ-02 | 🟡 Revogar deve apagar o histórico ou apenas parar a captura? (adotado: apenas parar) | Médio | Leandro | v0.1 |
| OQ-03 | 🟡 Como o usuário é cadastrado na v0.1: comando do operador ou auto-cadastro pelo agente? | Baixo | Leandro | v0.1 |

---

## 15. Decisões Tomadas (Decision Log)

| Decisão | Alternativas consideradas | Racional |
|---------|--------------------------|---------|
| 🟡 `provider` como texto livre | 🟡 Enum fechado | 🟡 WhatsApp-first, not only: novos canais sem migração. |
| 🟡 `KnowledgeSpace.kind` já prevê `shared` | 🟡 Só espaço pessoal | 🟡 Prepara a P3 sem implementar compartilhamento. |
| 🟡 Fonte nasce `not_authorized` | 🟡 Captura tudo e filtra depois | 🟡 Opt-in por conversa é requisito do PRD. |

---

## Apêndice

### Referências
- 🟡 `_reversa_sdd/prd.md` seções 4, 6, 8, 9
- 🟡 `_reversa_sdd/personas.md`

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
