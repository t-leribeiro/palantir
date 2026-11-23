---
schema_version: 1
id: BUG-20261123-LDMD
display_number: 3
title: '"Mensagem apagada" entra como texto pesquisável'
status: resolved
phase: delivering
severity: medium
priority: P2
created: 2026-11-23
updated: '2026-11-23'
origin:
  type: manual-report
  external_ref: null
area: channels
module: whatsapp-export-importer
feature: 002-perguntar-historico-importado
labels: []
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
  - _reversa_forward/002-perguntar-historico-importado/requirements.md#RN-04
  - _reversa_forward/002-perguntar-historico-importado/requirements.md#RF-04
  - _reversa_sdd/sdd/whatsapp-export-importer.md#6.1 Requisitos Principais (RF-07)
  affected_code:
  - src/channels/whatsapp-export/parse.ts#DELETED
  root_cause:
    state: confirmed
    hypothesis: O regex DELETED só conhecia 'Esta mensagem foi apagada'; o Android pt-BR atual escreve 'Mensagem apagada'.
    causal_path:
    - parse.ts#DELETED
    - parse.ts#classify
    evidence:
    - ref: evidence/reproduction.md
      observation: 'Export real: 7 mensagens ''Mensagem apagada'' entravam como texto; agora 0.'
    code_refs:
    - file: src/channels/whatsapp-export/parse.ts
      symbol: DELETED
      commit: 0cfee41
  reproduction_tests:
  - test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > ignora mensagem sem texto e "Mensagem apagada" como sistema (BUG-2, BUG-3)
  regression_tests:
  - test/unit/whatsapp-export/real-exports.test.ts (markers = 0)
  - test/unit/whatsapp-export/parse.test.ts > Android pt-BR > ignora sistema (criptografia, entrada, mensagem apagada)
spec_verdict: spec-correta
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

# "Mensagem apagada" entra como texto pesquisável

## Summary
O Android pt-BR atual escreve "Mensagem apagada"; o parser só conhecia "Esta mensagem foi apagada".

## Expected Behavior
RN-04/RF-04: mensagem apagada é de sistema, não fica pesquisável e conta como ignorada.

## Actual Behavior
7 mensagens "Mensagem apagada" do export real seriam indexadas como texto.

## Steps to Reproduce
1. Export com `22/11/2026 09:03 - Ana: Mensagem apagada`
2. Importar
3. A mensagem fica pesquisável.

## Evidence
- `evidence/intake.md` (aponta o relato; contagens da execução a seco sobre o export real local)

## Suspected Area
- `src/channels/whatsapp-export/parse.ts#DELETED`

## Acceptance Criteria
- "Mensagem apagada" é ignorada como sistema

## Traceability
- Specs: `_reversa_forward/002-perguntar-historico-importado/requirements.md#RN-04`; `_reversa_forward/002-perguntar-historico-importado/requirements.md#RF-04`; `_reversa_sdd/sdd/whatsapp-export-importer.md#6.1 Requisitos Principais (RF-07)`
- Código afetado: `src/channels/whatsapp-export/parse.ts#DELETED`

## Resolution
- **Causa raiz (confirmed):** O regex DELETED só conhecia 'Esta mensagem foi apagada'; o Android pt-BR atual escreve 'Mensagem apagada'.
- **Veredito de spec (aprovado pelo usuário):** `spec-correta`; nada muda na spec
- **resolution_kind:** `fixed` (closure `local-software`: regressão passando + veredito)

| CHG | tipo | artefato | propósito |
|-----|------|----------|-----------|
| CHG-001 | test | `test/fixtures/whatsapp-export/android-pt-br-formas-reais.txt, test/unit/whatsapp-export/parse.test.ts, test/unit/whatsapp-export/importer.test.ts, test/unit/whatsapp-export/real-exports.test.ts` | Fixture sintética anônima com as formas reais, testes de reprodução e teste local sobre exports/ |
| CHG-002 | code | `src/channels/whatsapp-export/parse.ts` | Formato travado pelo primeiro cabeçalho; vazias ignoradas; Mensagem apagada; marcador de edição; prefixo ~ |

Diffs de código: `fix/CHG-*.diff`. Diff de spec: nenhum (spec-correta).

**Prova vermelho → verde:** antes da correção, `npx vitest run --project unit test/unit/whatsapp-export` saiu com exit 1 (7 falhas); depois, 111/111 e `npm run dor` todo verde. Testes de reprodução: `test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > ignora mensagem sem texto e "Mensagem apagada" como sistema (BUG-2, BUG-3)`. Regressão: `test/unit/whatsapp-export/real-exports.test.ts (markers = 0)`; `test/unit/whatsapp-export/parse.test.ts > Android pt-BR > ignora sistema (criptografia, entrada, mensagem apagada)`.

## Agent Notes
- Severidade e prioridade propostas pelo registrador (o usuário aprovou a correção no chat sem graduar).
- Os 5 bugs deste relato nascem no mesmo parser e serão corrigidos juntos, num PR.
- Nunca copiar o export real para o repositório: ele tem dados de terceiros e o repo é público.
