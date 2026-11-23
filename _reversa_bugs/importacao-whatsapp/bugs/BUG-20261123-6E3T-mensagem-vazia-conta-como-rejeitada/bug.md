---
schema_version: 1
id: BUG-20261123-6E3T
display_number: 2
title: Mensagem sem texto é contada como rejeitada no relatório
status: resolved
phase: delivering
severity: low
priority: P2
created: 2026-11-23
updated: '2026-11-23'
origin:
  type: manual-report
  external_ref: null
area: channels
module: whatsapp-export-importer
feature: 002-perguntar-historico-importado
labels:
- spec-gap
- relatorio
visibility: normal
security_suspected: false
reproduction:
  classification: deterministic
  rate: 1/1
  suspected_triggers: []
blocking: []
relationships: []
traceability:
  specs:
  - _reversa_sdd/sdd/whatsapp-export-importer.md#6.1 Requisitos Principais (RF-09)
  affected_code:
  - src/channels/whatsapp-export/parse.ts#classify
  - src/channels/whatsapp-export/importer.ts#ingestOne
  root_cause:
    state: confirmed
    hypothesis: 'classify aceitava ''Autor: '' sem texto como kind text; o contrato (corretamente) exige text com minLength 1 para kind text, e o importador contava a recusa como rejeitada.'
    causal_path:
    - parse.ts#classify (texto vazio = text)
    - importer.ts#ingestOne (validateCanonicalMessage falha)
    - 'contracts/channel/canonical-message.schema.json allOf: text minLength 1'
    evidence:
    - ref: evidence/reproduction.md
      observation: 'Export real: 10 rejeitadas antes, 0 depois; ignoradas passam de 12 para 29 (12 sistema + 7 apagadas + 10 vazias).'
    code_refs:
    - file: src/channels/whatsapp-export/parse.ts
      symbol: classify
      commit: 0cfee41
  reproduction_tests:
  - test/unit/whatsapp-export/importer.test.ts > importWhatsAppExport > mensagem sem texto é ignorada, não rejeitada (BUG-2)
  - test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > ignora mensagem sem texto e "Mensagem apagada" como sistema (BUG-2, BUG-3)
  regression_tests:
  - test/unit/whatsapp-export/real-exports.test.ts (rejected = 0, emptyTexts = 0)
spec_verdict: spec-gap
change_set:
- id: CHG-001
  kind: test
  artifact: test/fixtures/whatsapp-export/android-pt-br-formas-reais.txt, test/unit/whatsapp-export/parse.test.ts, test/unit/whatsapp-export/importer.test.ts, test/unit/whatsapp-export/real-exports.test.ts
  purpose: Fixture sintética anônima com as formas reais, testes de reprodução e teste local sobre exports/
  diff: fix/CHG-001.diff
- id: CHG-002
  kind: code
  artifact: src/channels/whatsapp-export/parse.ts
  purpose: Formato travado pelo primeiro cabeçalho; vazias ignoradas; Mensagem apagada; marcador de edição; prefixo ~
  diff: fix/CHG-002.diff
- id: CHG-003
  kind: code
  artifact: src/main/import.ts
  purpose: Relatório passa a dizer 'de sistema ou sem texto ignoradas'
  diff: fix/CHG-003.diff
- id: CHG-004
  kind: specification
  artifact: _reversa_sdd/addenda/bug-BUG-20261123-6E3T-v001.md
  purpose: Adendo spec-gap aprovado
closure:
  policy: local-software
  satisfied: true
resolution_kind: fixed
data_impact:
  description: Imports feitos antes da correção guardam as mensagens afetadas como estavam; mensagens são imutáveis, então reimportar acrescenta as versões corrigidas sem remover as antigas. Só há dados
    locais (nenhum ambiente compartilhado).
change_risk:
  classification: baixa
  motivos:
  - só o parser do adaptador de exportação
  - sem mudança de contrato nem de dados
  - coberto por testes unitários, E2E e mutação
delivery:
  branch: fix/002-export-real
  pr: null
  ci: null
  merge: null
---

# Mensagem sem texto é contada como rejeitada no relatório

## Summary
Linhas `Autor: ` sem texto (mídia sem legenda) chegam ao contrato com texto vazio e são recusadas.

## Expected Behavior
Spec-gap: a spec não trata mensagem sem conteúdo. Pela RF-09 o relatório separa importadas, ignoradas e duplicadas; mensagem vazia não é conhecimento e deveria ser ignorada, não rejeitada.

## Actual Behavior
10 mensagens aparecem como "rejeitadas" no relatório do export real, sugerindo erro.

## Steps to Reproduce
1. Export com a linha `22/11/2026 09:02 - Ana: ` (sem texto)
2. Importar
3. Relatório mostra 1 rejeitada.

## Evidence
- `evidence/intake.md` (aponta o relato; contagens da execução a seco sobre o export real local)

## Suspected Area
- `src/channels/whatsapp-export/parse.ts#classify`
- `src/channels/whatsapp-export/importer.ts#ingestOne`

## Acceptance Criteria
- Mensagem sem texto é ignorada e contada junto das de sistema
- O export real local termina com 0 rejeitadas

## Traceability
- Specs: `_reversa_sdd/sdd/whatsapp-export-importer.md#6.1 Requisitos Principais (RF-09)`
- Código afetado: `src/channels/whatsapp-export/parse.ts#classify`, `src/channels/whatsapp-export/importer.ts#ingestOne`

## Resolution
- **Causa raiz (confirmed):** classify aceitava 'Autor: ' sem texto como kind text; o contrato (corretamente) exige text com minLength 1 para kind text, e o importador contava a recusa como rejeitada.
- **Veredito de spec (aprovado pelo usuário):** `spec-gap`; adendo `_reversa_sdd/addenda/bug-BUG-20261123-6E3T-v001.md`
- **resolution_kind:** `fixed` (closure `local-software`: regressão passando + veredito)

| CHG | tipo | artefato | propósito |
|-----|------|----------|-----------|
| CHG-001 | test | `test/fixtures/whatsapp-export/android-pt-br-formas-reais.txt, test/unit/whatsapp-export/parse.test.ts, test/unit/whatsapp-export/importer.test.ts, test/unit/whatsapp-export/real-exports.test.ts` | Fixture sintética anônima com as formas reais, testes de reprodução e teste local sobre exports/ |
| CHG-002 | code | `src/channels/whatsapp-export/parse.ts` | Formato travado pelo primeiro cabeçalho; vazias ignoradas; Mensagem apagada; marcador de edição; prefixo ~ |
| CHG-003 | code | `src/main/import.ts` | Relatório passa a dizer 'de sistema ou sem texto ignoradas' |
| CHG-004 | specification | `_reversa_sdd/addenda/bug-BUG-20261123-6E3T-v001.md` | Adendo spec-gap aprovado |

Diffs de código: `fix/CHG-*.diff`. Diff de spec: o adendo acima.

**Prova vermelho → verde:** antes da correção, `npx vitest run --project unit test/unit/whatsapp-export` saiu com exit 1 (7 falhas); depois, 111/111 e `npm run dor` todo verde. Testes de reprodução: `test/unit/whatsapp-export/importer.test.ts > importWhatsAppExport > mensagem sem texto é ignorada, não rejeitada (BUG-2)`; `test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > ignora mensagem sem texto e "Mensagem apagada" como sistema (BUG-2, BUG-3)`. Regressão: `test/unit/whatsapp-export/real-exports.test.ts (rejected = 0, emptyTexts = 0)`.

## Agent Notes
- Severidade e prioridade propostas pelo registrador (o usuário aprovou a correção no chat sem graduar).
- Os 5 bugs deste relato nascem no mesmo parser e serão corrigidos juntos, num PR.
- Nunca copiar o export real para o repositório: ele tem dados de terceiros e o repo é público.
