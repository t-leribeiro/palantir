---
schema_version: 1
id: BUG-20261123-SIUF
display_number: 4
title: Sufixo "<Mensagem editada>" fica dentro do texto
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
labels:
- spec-gap
- citacao
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
  - _reversa_sdd/sdd/whatsapp-export-importer.md#6.1 Requisitos Principais (RF-02)
  affected_code:
  - src/channels/whatsapp-export/parse.ts#toMessage
  root_cause:
    state: confirmed
    hypothesis: O parser não conhecia o marcador que o app acrescenta ao fim de mensagens editadas.
    causal_path:
    - parse.ts#toMessage (texto sem tratamento do marcador)
    evidence:
    - ref: evidence/reproduction.md
      observation: 'Export real: 53 mensagens terminando em ''<Mensagem editada>''; agora 0.'
    code_refs:
    - file: src/channels/whatsapp-export/parse.ts
      symbol: toMessage
      commit: 0cfee41
  reproduction_tests:
  - test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > tira o marcador de edição do fim do texto (BUG-4)
  regression_tests:
  - test/unit/whatsapp-export/real-exports.test.ts (markers = 0)
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
  kind: specification
  artifact: _reversa_sdd/addenda/bug-BUG-20261123-SIUF-v001.md
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

# Sufixo "<Mensagem editada>" fica dentro do texto

## Summary
O WhatsApp acrescenta ` <Mensagem editada>` ao fim de mensagens editadas; o marcador é do app, não de quem escreveu.

## Expected Behavior
Spec-gap: a spec não trata mensagens editadas. O texto guardado e citado deve ser só o que o autor escreveu.

## Actual Behavior
53 mensagens do export real terminam com `<Mensagem editada>`, que entraria na busca e na citação.

## Steps to Reproduce
1. Export com `22/11/2026 09:04 - Ana: o broker era o 3 <Mensagem editada>`
2. Importar
3. O texto guardado inclui o marcador.

## Evidence
- `evidence/intake.md` (aponta o relato; contagens da execução a seco sobre o export real local)

## Suspected Area
- `src/channels/whatsapp-export/parse.ts#toMessage`

## Acceptance Criteria
- O marcador (pt-BR e en) é removido do fim do texto

## Traceability
- Specs: `_reversa_sdd/sdd/whatsapp-export-importer.md#6.1 Requisitos Principais (RF-02)`
- Código afetado: `src/channels/whatsapp-export/parse.ts#toMessage`

## Resolution
- **Causa raiz (confirmed):** O parser não conhecia o marcador que o app acrescenta ao fim de mensagens editadas.
- **Veredito de spec (aprovado pelo usuário):** `spec-gap`; adendo `_reversa_sdd/addenda/bug-BUG-20261123-SIUF-v001.md`
- **resolution_kind:** `fixed` (closure `local-software`: regressão passando + veredito)

| CHG | tipo | artefato | propósito |
|-----|------|----------|-----------|
| CHG-001 | test | `test/fixtures/whatsapp-export/android-pt-br-formas-reais.txt, test/unit/whatsapp-export/parse.test.ts, test/unit/whatsapp-export/importer.test.ts, test/unit/whatsapp-export/real-exports.test.ts` | Fixture sintética anônima com as formas reais, testes de reprodução e teste local sobre exports/ |
| CHG-002 | code | `src/channels/whatsapp-export/parse.ts` | Formato travado pelo primeiro cabeçalho; vazias ignoradas; Mensagem apagada; marcador de edição; prefixo ~ |
| CHG-003 | specification | `_reversa_sdd/addenda/bug-BUG-20261123-SIUF-v001.md` | Adendo spec-gap aprovado |

Diffs de código: `fix/CHG-*.diff`. Diff de spec: o adendo acima.

**Prova vermelho → verde:** antes da correção, `npx vitest run --project unit test/unit/whatsapp-export` saiu com exit 1 (7 falhas); depois, 111/111 e `npm run dor` todo verde. Testes de reprodução: `test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > tira o marcador de edição do fim do texto (BUG-4)`. Regressão: `test/unit/whatsapp-export/real-exports.test.ts (markers = 0)`.

## Agent Notes
- Severidade e prioridade propostas pelo registrador (o usuário aprovou a correção no chat sem graduar).
- Os 5 bugs deste relato nascem no mesmo parser e serão corrigidos juntos, num PR.
- Nunca copiar o export real para o repositório: ele tem dados de terceiros e o repo é público.
