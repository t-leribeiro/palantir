# Spec: whatsapp-baileys-adapter

**Versão:** 1.0
**Status:** Rascunho
**Autor:** reversa-spec-sdd
**Data:** 2026-11-22
**Reviewers:** N/A

> Selo 🟡 PLANEJADO em todos os itens. Fonte: `_reversa_sdd/prd.md`.

---

## 1. Resumo

🟡 Adaptador `KnowledgeChannel` que usa a biblioteca não oficial Baileys para conectar um número secundário dedicado ao WhatsApp, capturar mensagens novas das conversas autorizadas, baixar mídias e enviar as respostas do agente. Roda em experimento controlado e é substituível.

---

## 2. Contexto e Motivação

**Problema:**
🟡 A API oficial do WhatsApp não dá acesso a grupos pessoais existentes. Para validar a tese com rapidez, a v0.1 precisa capturar mensagens reais de grupos de teste e conversar com o usuário pelo WhatsApp.

**Evidências:**
🟡 PRD seção 4 (captura contínua experimental via Baileys), seção 7 (dependência do Baileys) e seção 8 (risco alto de instabilidade e bloqueio).

**Por que agora:**
🟡 É a forma mais curta de colocar mensagens reais no walking skeleton e testar as jornadas P1/P2.

---

## 3. Goals (Objetivos)

- [ ] 🟡 G-01: Capturar ≥ 95% das mensagens observáveis das conversas autorizadas.
- [ ] 🟡 G-02: Reconectar sozinho após queda sem perder mensagens recebidas durante a reconexão.
- [ ] 🟡 G-03: Entregar as respostas do agente ao usuário pelo mesmo número.
- [ ] 🟡 G-04: Passar 100% da suíte de contrato de `channel-contract`.

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| 🟡 Mensagens observáveis capturadas | n/a | ≥ 95% | experimento de validação |
| 🟡 Tempo de reconexão após queda de rede | n/a | ≤ 60 s | v0.1 |
| 🟡 Latência entre recebimento e entrega à ingestão | n/a | P95 < 2 s | v0.1 |

---

## 4. Non-Goals (Fora do Escopo)

- 🟡 NG-01: Recuperar o histórico antigo das conversas (coberto por `whatsapp-export-importer`).
- 🟡 NG-02: Múltiplos números ou múltiplos usuários com sessões próprias na v0.1; há uma sessão do número do agente.
- 🟡 NG-03: Uso da WhatsApp Business Platform (Cloud API); fica como adaptador futuro.
- 🟡 NG-04: Enviar mensagens proativas ou em massa; o adaptador só responde a quem falou com o agente.

---

## 5. Usuários e Personas

**Usuário primário:** 🟡 P1 e P2, que conversam com o número do agente e têm grupos capturados.
**Usuário secundário:** 🟡 Operador, que pareia o número via QR Code e acompanha a saúde da sessão.

**Jornada atual (sem a feature):**
🟡 Não há forma automática de levar mensagens de grupos do WhatsApp para uma base consultável.

**Jornada futura (com a feature):**
1. 🟡 O operador pareia o número secundário lendo um QR Code.
2. 🟡 O número participa dos grupos de teste autorizados.
3. 🟡 Mensagens novas desses grupos chegam à ingestão em segundos.
4. 🟡 O usuário conversa com o número e recebe as respostas do agente.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | 🟡 O sistema deve parear o número via QR Code exibido no terminal ou endpoint do operador. | Must | 🟡 Ler o QR Code com o celular resulta em sessão `connected`. |
| RF-02 | 🟡 O sistema deve persistir as credenciais de sessão criptografadas (AES-256-GCM, chave fora do repositório). | Must | 🟡 Reiniciar o processo reconecta sem novo QR Code; o arquivo de sessão não é legível em texto puro. |
| RF-03 | 🟡 O sistema deve listar as conversas (grupos e diretas) e publicá-las em `identity-and-sources` como `Source` `not_authorized`. | Must | 🟡 Grupo novo do número aparece como fonte não autorizada. |
| RF-04 | 🟡 O sistema deve converter mensagens recebidas de conversas autorizadas em `CanonicalMessage` com `captureMethod=live` e `externalMessageId` preenchido. | Must | 🟡 Texto, áudio, imagem, documento e link chegam à ingestão com os campos obrigatórios. |
| RF-05 | 🟡 O sistema deve descartar, sem baixar mídia, mensagens de conversas não autorizadas. | Must | 🟡 Mensagem de grupo não autorizado não gera chamada de download nem registro. |
| RF-06 | 🟡 O sistema deve baixar mídias via `fetchMedia` e entregá-las ao object storage. | Must | 🟡 Áudio de 5 min fica disponível no storage com o `storageKey` informado. |
| RF-07 | 🟡 O sistema deve reconectar com backoff exponencial (1 s a 60 s) após queda e processar as mensagens entregues na retomada. | Must | 🟡 Derrubar a rede por 30 s e restaurar não perde mensagens enviadas no intervalo que o provedor reentrega. |
| RF-08 | 🟡 O sistema deve renderizar `AgentReply` para o WhatsApp (negrito com `*`, itálico com `_`, divisão em partes ≤ 4.000 caracteres). | Must | 🟡 Resposta longa chega em partes numeradas com as citações intactas. |
| RF-09 | 🟡 O sistema deve encaminhar mensagens diretas enviadas ao número do agente como entrada do `conversational-agent`, separadas das fontes capturadas. | Must | 🟡 Pergunta enviada ao agente não é indexada como conhecimento, exceto quando o usuário pede "guardar". |
| RF-10 | 🟡 O sistema deve limitar o envio a 1 mensagem por segundo por destinatário. | Should | 🟡 Rajada de 10 respostas é espaçada em ≥ 9 s. |
| RF-11 | 🟡 O sistema deve expor o estado da sessão (`connected`, `reconnecting`, `logged_out`) como métrica e health check. | Must | 🟡 Health check retorna o estado atual; `logged_out` gera alerta. |

### 6.2 Fluxo Principal (Happy Path)

1. 🟡 O processo inicia e carrega as credenciais de sessão criptografadas.
2. 🟡 O sistema conecta ao WhatsApp e marca a sessão como `connected`.
3. 🟡 Chega uma mensagem de um grupo autorizado; o sistema a converte em `CanonicalMessage`.
4. 🟡 O sistema baixa a mídia, quando houver, e entrega a mensagem à ingestão.
5. 🟡 O usuário pergunta algo ao número; o sistema entrega ao agente e envia o `AgentReply` renderizado.
6. 🟡 Resultado: mensagem capturada e pergunta respondida pelo mesmo número.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Sessão encerrada no celular:**
1. 🟡 O provedor sinaliza logout; o sistema marca `logged_out`, apaga as credenciais inválidas e alerta o operador.
2. 🟡 O operador refaz o pareamento por QR Code.

**Fluxo Alternativo B — Mensagem encaminhada ao agente:**
1. 🟡 O usuário encaminha um áudio ao número com o pedido "guarda isso em arquitetura".
2. 🟡 O sistema entrega o conteúdo com `captureMethod=forwarded_to_agent` para o `conversational-agent`.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | 🟡 Performance | 🟡 P95 < 2 s do recebimento à entrega | 🟡 Sem contar download de mídia. |
| RNF-02 | 🟡 Disponibilidade | 🟡 Reconexão ≤ 60 s | 🟡 Experimento, sem SLA. |
| RNF-03 | 🟡 Segurança | 🟡 Credenciais sempre criptografadas e fora de logs | 🟡 Verificado por teste que procura o conteúdo da sessão nos logs. |
| RNF-04 | 🟡 Recursos | 🟡 ≤ 300 MB de memória em operação | 🟡 Execução local. |

---

## 8. Design e Interface

**Componentes afetados:** 🟡 Processo do adaptador, store de sessão criptografado, health check, métricas.

**Comportamento esperado:**
🟡 O adaptador roda como processo próprio dentro do monólito modular e publica mensagens para a ingestão pela fila interna.

**Estados da UI:**
- 🟡 Estado vazio: sem sessão, o operador vê o QR Code para parear.
- 🟡 Estado de carregamento: `reconnecting`, exibido no health check.
- 🟡 Estado de erro: `logged_out`, com alerta e instrução de novo pareamento.
- 🟡 Estado de sucesso: `connected`, com contagem de mensagens capturadas na última hora.

---

## 9. Modelo de Dados

```
ChannelSession { channel_account_id: uuid, adapter: text, encrypted_credentials: bytea,
                 status: enum(connected, reconnecting, logged_out), updated_at: timestamptz }
```

**Migrações necessárias:** 🟡 Sim, tabela `ChannelSession` (ou arquivo criptografado local equivalente).

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| 🟡 Baileys (biblioteca) | Obrigatória | 🟡 Captura e envio param; importação e consultas já indexadas continuam funcionando. |
| 🟡 Servidores do WhatsApp | Obrigatória | 🟡 Reconexão com backoff; estado `reconnecting`. |
| 🟡 Object storage | Obrigatória | 🟡 Mensagem entregue sem mídia e download reagendado. |
| 🟡 `channel-contract`, `identity-and-sources`, `ingestion` | Obrigatória | 🟡 Mensagens ficam em buffer local até 10.000 itens. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| 🟡 EC-01: Número bloqueado ou banido | 🟡 Provedor recusa a conexão | 🟡 Marcar `logged_out`, parar retries, alertar operador; o restante do produto segue funcionando. |
| 🟡 EC-02: Falha no download de mídia | 🟡 Timeout ou mídia expirada | 🟡 3 tentativas com backoff; depois, registrar a mensagem com `attachment.status=unavailable`. |
| 🟡 EC-03: Mensagem duplicada na reconexão | 🟡 Provedor reentrega | 🟡 Entregar igual; a ingestão deduplica por `externalMessageId`. |
| 🟡 EC-04: Buffer local cheio | 🟡 Ingestão fora do ar por longo período | 🟡 Parar de aceitar novas mensagens, alertar e registrar a quantidade perdida. |
| 🟡 EC-05: Baileys muda o formato após atualização do WhatsApp | 🟡 Falha de parsing | 🟡 Descartar a mensagem com erro registrado e alertar; suíte de contrato deve falhar no CI. |

---

## 12. Segurança e Privacidade

- **Autenticação:** 🟡 Sessão do número dedicado; credenciais tratadas como segredo.
- **Autorização:** 🟡 Só processa conversas `authorized` em `identity-and-sources`.
- **Dados sensíveis:** 🟡 Conteúdo de mensagens e credenciais; nunca registrar corpo de mensagens nem credenciais em logs.
- **Auditoria:** 🟡 Eventos de pareamento, logout e bloqueio registrados.

---

## 13. Plano de Rollout

- **Estratégia:** 🟡 Somente número secundário dedicado e grupos de teste com participantes informados.
- **Como reverter (rollback):** 🟡 Desligar o adaptador por configuração; dados já ingeridos permanecem.
- **Monitoramento pós-deploy:** 🟡 Estado da sessão, mensagens capturadas por hora, falhas de mídia e reconexões.

---

## 14. Open Questions

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | 🟡 O número do agente e o número de captura são o mesmo ou separados? (recomendação da ideação: um número secundário para o agente e outro número de teste como fonte) | Alto | Leandro | Antes do experimento |
| OQ-02 | 🟡 Como medir "mensagens observáveis" para a meta de 95% (contagem manual em grupos de teste)? | Médio | Leandro | Experimento |

---

## 15. Decisões Tomadas (Decision Log)

| Decisão | Alternativas consideradas | Racional |
|---------|--------------------------|---------|
| 🟡 Baileys | 🟡 whatsapp-web.js (Puppeteer), extensão Chrome | 🟡 Sem navegador, menor consumo; extensão fica como alternativa futura. |
| 🟡 Uma sessão na v0.1 | 🟡 Sessão por usuário | 🟡 Reduz risco e complexidade no experimento. |

---

## Apêndice

### Referências
- 🟡 `_reversa_sdd/prd.md` seções 4, 6, 7, 8
- 🟡 `_reversa_sdd/sdd/channel-contract.md`

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
