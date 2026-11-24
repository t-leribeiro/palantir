# Adendo: Captura ao vivo de um grupo de teste autorizado (fatia S3)

> Feature: `004-captura-ao-vivo-grupo-teste`
> Data: `2026-11-23`
> Cenário: `greenfield`

## Vigência

Vigente desde 2026-11-23.

## Resumo da entrega

Um número de captura que participa de um grupo de teste passa a guardar as mensagens novas do grupo como conhecimento, depois que o operador autoriza aquele grupo explicitamente e declara o consentimento. Em segundos, a mensagem aparece nas respostas do agente pelo WhatsApp, com autor, grupo e data. Quando o grupo também tem histórico importado, a mensagem fica com um único registro.

Enquanto não existe o segundo chip, o próprio número do agente captura. É o modo `agent`, provisório, com o risco de bloqueio conjunto aceito (nota na ADR-0009). O modo `dedicated` já está pronto para um segundo número. Só texto entra: mídia é contada e descartada, e fica para a S4. Nenhum número escreve em grupos.

As 16 ações foram concluídas, e o `progress.jsonl` registra duas correções (T006 e T012). Elas vieram da demonstração com o chip: um grupo de nome parecido foi autorizado por engano, e agora autorizar com `--conversa` exige o mesmo nome do grupo, ou `--confirmar`. A entrega está no PR #7. A demonstração com o chip continuava em andamento na data deste adendo: falta capturar no grupo de teste escolhido, onde o chip ainda não estava.

## Impacto por artefato da extração

As specs continuam 🟡 PLANEJADO. Leia-as junto com este adendo e com os adendos `001`, `002` e `003`, mais os de bug (`bug-*`).

| Artefato | Seção | Tipo de impacto | Delta |
|----------|-------|-----------------|-------|
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` | 6. Requisitos Funcionais | regra-alterada | O mesmo adaptador tem os papéis `answer` e `capture`, por `PALANTIR_WHATSAPP_CAPTURE` (`off`, `agent`, `dedicated`).<br>RF-03: os grupos do número de captura vão para um diretório, sem participantes.<br>RF-04: só o texto de grupo autorizado, e posterior à autorização, vira `CanonicalMessage` `live` com `externalMessageId`.<br>RF-05: grupo não autorizado e mídia (contada por tipo, sem download) são descartados.<br>Envio a grupo é bloqueado no provedor. No modo `dedicated`, mensagem direta ao número de captura é descartada. |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` | 9. Modelo de Dados | regra-nova | O autor ao vivo é o número E.164, resolvido por `participant`, `participantAlt` ou `lidMapping`, ou então `lid:<id>`. O nome mostrado é o de perfil; sem ele, o número mascarado; sem número, "Participante". O modo `dedicated` guarda a sessão em `capture-session.enc`, separada da do agente. |
| `_reversa_sdd/sdd/ingestion.md` | 6. Requisitos Funcionais | regra-alterada | RF-04: a reconciliação ao vivo × importada funciona nos dois sentidos, por mesmo texto normalizado (NFC, minúsculas, espaços colapsados) e diferença de até 60 s. O autor só desempata e deixou de ser critério. Ao reconciliar, a chave que faltava é preenchida, a proveniência é acrescentada e não há novo job de indexação. |
| `_reversa_sdd/sdd/ingestion.md` | 9. Modelo de Dados | delta-de-dados | Novo índice `messages (source_id, sent_at)` para buscar candidatos à reconciliação, travados com `FOR UPDATE`. |
| `_reversa_sdd/sdd/identity-and-sources.md` | 6. Requisitos Funcionais | regra-nova | RF-04, RF-05 e RF-10 por comando (`npm run whatsapp:grupos`), que lê e grava só no banco:<br>listar; autorizar com consentimento declarado (10 a 500 caracteres), por posição na lista ou id; `--conversa` liga o grupo à fonte `export:<nome>` da importação, exigindo o mesmo nome do grupo ou `--confirmar`; revogar.<br>Revogar para só a captura: o histórico continua nas respostas. Grupos nunca são casados por nome sem pedido explícito. |
| `_reversa_sdd/sdd/identity-and-sources.md` | 9. Modelo de Dados | delta-de-dados | Tabelas novas:<br>`source_captures`: autorização auditada, com quem, quando e o consentimento; histórico por `revoked_at`; no máximo uma ativa por grupo.<br>`whatsapp_groups`: diretório escrito pelo processo do WhatsApp, só com nome e número de participantes. |
| `_reversa_sdd/sdd/channel-contract.md` | 6. Requisitos Funcionais | delta-de-contrato-externo | `IngestOutcome` ganha `reconciled` (aditivo; o contrato continua 1.2.0, ver ADR-0004). A rota do canal de teste responde `reconciled`. A suíte de contrato (RF-07) roda os testes de captura no WhatsApp simulado. |
| `_reversa_sdd/sdd/platform-foundation.md` | 6. Requisitos Funcionais | componente-novo | O processo do WhatsApp passa a ingerir, e usa o pg-boss só para publicar a indexação. O health ganha `capture`, e `off` conta como saudável. Métricas novas: capturadas, descartadas por motivo, mídia ignorada e reconciliadas. Estado e alertas ganham o rótulo `role`, e o painel "WhatsApp" ganha os painéis de captura. O setup preserva o modo de captura no `.env`. |
| `_reversa_sdd/sdd/whatsapp-export-importer.md` | 6. Requisitos Funcionais | regra-alterada | O relatório da importação mostra "Reconciliadas com a captura ao vivo" quando a importação encontra mensagens já capturadas. Ver também o adendo `bug-BUG-20261123-S57G-v001.md`: as legendas de mídia viram mensagens (PR #8). |
| `_reversa_sdd/prd.md` | 4. Escopo (in) | componente-novo | A captura contínua via Baileys foi entregue para texto de grupos de teste autorizados. O segundo número continua opcional (modo `dedicated`). A gestão de grupos conversando com o agente e a base legal ficam para a S5. |

Impactos registrados: 10 linhas, assim distribuídas:
- 4 `regra-alterada`
- 2 `regra-nova`
- 2 `delta-de-dados`
- 1 `delta-de-contrato-externo`
- 2 `componente-novo`

Regras 🟡 que evoluem:
- A RN-01 da S2 ("o número do agente não captura") fica suspensa no modo `agent`.
- A RF-04 de `ingestion` deixa de usar o autor como critério.

## Regras sob vigilância

W001 a W014, em `_reversa_forward/004-captura-ao-vivo-grupo-teste/regression-watch.md` (seção Observações).

## Fontes

- `_reversa_forward/004-captura-ao-vivo-grupo-teste/legacy-impact.md`
- `_reversa_forward/004-captura-ao-vivo-grupo-teste/regression-watch.md`
- `_reversa_forward/004-captura-ao-vivo-grupo-teste/requirements.md`
- `_reversa_forward/004-captura-ao-vivo-grupo-teste/roadmap.md` (D-01 a D-17)
- `_reversa_forward/004-captura-ao-vivo-grupo-teste/progress.jsonl`
- `_reversa_forward/004-captura-ao-vivo-grupo-teste/actions.md` (Notas de execução)
- `_reversa_forward/004-captura-ao-vivo-grupo-teste/interfaces/`
- `docs/adr/0009-adaptador-whatsapp-nao-oficial.md`, `docs/adr/0004-contrato-do-canal-schema-first.md`
