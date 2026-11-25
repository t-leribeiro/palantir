# Adendo: Gerenciar grupos conversando com o agente (fatia S5)

> Feature: `006-gerenciar-grupos-pelo-agente`
> Data: `2026-11-24`
> Cenário: `greenfield`

## Vigência

Vigente desde 2026-11-24.

## Resumo da entrega

O dono gerencia as fontes conversando com o agente pelo WhatsApp:
- `grupos` lista os grupos do chip e as conversas importadas, numerados e com o estado de cada um;
- `acompanhar` exige a confirmação do consentimento;
- `parar` vale a partir da próxima mensagem;
- `apagar` exige `confirmo apagar <nome>` e remove a conversa com tudo o que veio dela.

Antes de qualquer ordem, a conta prova a posse do número: o `npm run whatsapp:link` mostra no terminal um código de 6 dígitos, e o dono o manda ao agente do próprio WhatsApp. A pergunta que cita o nome completo de uma conversa busca só nela. Tudo fica numa auditoria sem conteúdo. A base legal escolhida é o consentimento declarado por grupo (ADR-0011).

As 24 ações foram concluídas, e o `progress.jsonl` tem 24 linhas. A entrega está no PR #14. A demonstração com o chip real foi feita em 2026-11-24, seguindo o `onboarding.md` da feature, e não mostrou nenhum problema.

## Impacto por artefato da extração

As specs continuam 🟡 PLANEJADO. Leia-as junto com este adendo, com os adendos `001` a `005` e com os de bug (`bug-*`).

| Artefato | Seção | Tipo de impacto | Delta |
|----------|-------|-----------------|-------|
| `_reversa_sdd/sdd/identity-and-sources.md` | 6. Requisitos Funcionais | regra-alterada | O que mudou nos requisitos:<br>• RF-03: o código não é mandado pelo canal. O `whatsapp:link` deixa a conta `pending` e mostra o código no terminal, e o dono o manda ao agente. O código tem 6 dígitos, vale 10 min, aceita 5 tentativas, só um fica vivo por conta e no banco fica só o hash SHA-256 com sal.<br>• RF-05: acompanhar e parar passam por um serviço de gestão comum ao agente e ao terminal. Acompanhar grava a declaração de consentimento.<br>• RF-07: a exclusão tem duas etapas. A confirmação marca a fonte `deleting`, revoga a captura e publica `sources.delete` pelo outbox. O worker purga a mídia pelo prefixo `<space>/<source>/` e apaga a fonte com cascata. A fonte em exclusão some da busca na hora e não aceita mensagem nova.<br>• RF-08 (retenção) não foi entregue. |
| `_reversa_sdd/sdd/identity-and-sources.md` | 9. Modelo de Dados | delta-de-dados | Migração `0008_source_management.sql`:<br>• `channel_account_verifications`, com um código vivo por conta;<br>• `source_deletions`, com as contagens, `notified_at` e `notify_title` (o título é limpo depois do aviso), e uma exclusão aberta por fonte;<br>• `audit_events`;<br>• índice `sources (space_id)`.<br>As contas ativas sem verificação, exceto as do canal `fake`, voltaram a `pending`. |
| `_reversa_sdd/sdd/identity-and-sources.md` | 12. Segurança e Privacidade | regra-nova | A auditoria (`audit_events`) registra vínculo, verificação, bloqueio do código, acompanhar, parar, pedido e conclusão da exclusão. O alvo é um id sem FK, e os detalhes aceitam só contagens. O `npm run auditoria` mostra o nome da fonte só enquanto ela existe, e o telefone mascarado. Logs e métricas não têm nome de grupo, telefone nem código. |
| `_reversa_sdd/sdd/identity-and-sources.md` | 14. Open Questions | regra-alterada | A OQ-01 está fechada: a base legal é o consentimento declarado por grupo (LGPD, art. 7º, I), conforme o ADR-0011. Outra base legal exige nova decisão registrada. |
| `_reversa_sdd/sdd/conversational-agent.md` | 6. Requisitos Funcionais | componente-novo | O núcleo do agente ganhou comandos por palavras fixas, neutros quanto ao canal e sem LLM: `grupos`, `meus grupos`, `listar grupos`, `conversas`, `mais`, `acompanhar`, `parar`, `apagar`, `confirmo` e `confirmo apagar <nome>`. A ordem de tratamento é:<br>• conta pendente, que só aceita o código;<br>• confirmação pendente;<br>• comandos;<br>• ajuda;<br>• busca.<br>Para achar o alvo, o agente tenta o número da lista dos últimos 30 min, depois o nome exato e por fim um trecho único do nome. Um nome ambíguo lista as opções e não faz nada. Mensagem escrita dentro de um grupo nunca é comando. A ajuda ganhou a seção "Seus grupos". |
| `_reversa_sdd/sdd/conversational-agent.md` | 9. Modelo de Dados | delta-de-dados | `agent_conversation_state` (PK `user_id`, `provider`) guarda a última lista por 30 min e a ação pendente por 5 min. A ação é consumida de forma atômica, e as referências a uma fonte apagada são removidas junto com ela. |
| `_reversa_sdd/sdd/conversational-agent.md` | 6. Requisitos Funcionais | regra-alterada | O nome completo e normalizado de uma conversa do espaço, se aparece na pergunta em palavras inteiras, restringe a busca a ela e sai dos termos. Se mais de um nome aparece, vale o mais longo. Um título repetido em duas conversas devolve a resposta de ambiguidade, sem buscar. O filtro se combina com o "em qual áudio..." da S4. |
| `_reversa_sdd/sdd/retrieval.md` | 6. Requisitos Funcionais | regra-alterada | A `SearchRequest` ganha o campo opcional `sourceIds`, aplicado no SQL como `m.source_id = ANY($6)`. O contrato externo não mudou. |
| `_reversa_sdd/sdd/media-transcription.md` | 6. Requisitos Funcionais | regra-alterada | O armazenamento ganha `listKeys` e `deletePrefix`, e `createMediaPurger` apaga os objetos de uma fonte um por um (`DeleteObject`, porque o SeaweedFS não confere o checksum do lote). Jobs `media.process` de uma fonte apagada terminam como `skipped`. O `media:conferir` passou a contar os objetos órfãos. |
| `_reversa_sdd/sdd/platform-foundation.md` | 6. Requisitos Funcionais | componente-novo | Peças novas:<br>• fila `sources.delete` (12 tentativas, recuo de 30 s exponencial, fila morta `sources.delete.dead`), consumida pelo worker;<br>• fila de aviso por canal, `agent.notify.<canal>`, consumida pelo processo que tem o canal (o `fake` na API, o `whatsapp` no processo do WhatsApp, que agora sempre tem fila);<br>• métricas `agent_commands_total`, `source_deletion_items_total`, `source_deletion_seconds`, `source_deletions_in_progress`, `source_deletion_oldest_seconds` e `agent_notifications_total`;<br>• painel "Gestão" e alerta `SourceDeletionStalled` (acima de 1800 s);<br>• comando `npm run auditoria`;<br>• `whatsapp:grupos -- apagar <grupo> --nome "<nome>"`. |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` | 6. Requisitos Funcionais | regra-alterada | Abre-se uma exceção à regra da S3 de que nenhum número escreve espontaneamente: o aviso de conclusão da exclusão que o próprio dono pediu. Ele é mandado uma vez pelo `sendReply` do contrato e só para a conta do dono. O processo reivindica o aviso antes de mandar e devolve a reivindicação se o envio falhar. O contrato do canal não mudou. |
| `_reversa_sdd/prd.md` | 4. Escopo (in) | componente-novo | Foram entregues o opt-in por conversa feito pelo agente e a exclusão de fonte com os dados derivados, sem sobras no banco nem no armazenamento. A retenção configurável continua pendente. |
| `_reversa_sdd/prd.md` | 6. Restrições | regra-alterada | O enquadramento LGPD que estava `[INDEFINIDO]` foi decidido: consentimento declarado por grupo (ADR-0011). A exclusão atende ao direito de eliminação (art. 18, VI). |

Impactos registrados: 13 linhas, assim distribuídas:
- 7 `regra-alterada`
- 2 `delta-de-dados`
- 1 `regra-nova`
- 3 `componente-novo`

Regras 🟡 que evoluem:
- A RF-03 e a OQ-01 de `identity-and-sources` mudaram como descrito na tabela.
- A RN-06 da S3 ("revogar mantém o histórico até a S5"): o histórico agora pode ser apagado com `apagar`.
- A RN-08 da S3 ("nenhum número escreve espontaneamente") ganhou só a exceção do aviso de exclusão.

## Regras sob vigilância

W001 a W013, em `_reversa_forward/006-gerenciar-grupos-pelo-agente/regression-watch.md` (seção Observações).

## Fontes

- `_reversa_forward/006-gerenciar-grupos-pelo-agente/legacy-impact.md`
- `_reversa_forward/006-gerenciar-grupos-pelo-agente/regression-watch.md`
- `_reversa_forward/006-gerenciar-grupos-pelo-agente/requirements.md` (inclui a sessão de esclarecimentos de 2026-11-24)
- `_reversa_forward/006-gerenciar-grupos-pelo-agente/roadmap.md` (D-01 a D-20)
- `_reversa_forward/006-gerenciar-grupos-pelo-agente/progress.jsonl`
- `_reversa_forward/006-gerenciar-grupos-pelo-agente/actions.md` (Notas de execução)
- `_reversa_forward/006-gerenciar-grupos-pelo-agente/interfaces/`
- `docs/adr/0011-gestao-de-fontes-pelo-agente.md`
