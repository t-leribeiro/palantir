---
schema_version: 1
id: BUG-20261123-5UZC
display_number: 5
title: Prefixo "~" de contato fora da agenda entra no nome do autor
status: resolved
phase: delivering
severity: low
priority: P3
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
  - _reversa_sdd/sdd/whatsapp-export-importer.md#11. Edge Cases e Tratamento de Erros (EC-06)
  affected_code:
  - src/channels/whatsapp-export/parse.ts#classify
  root_cause:
    state: confirmed
    hypothesis: O parser não conhecia o prefixo '~' + U+202F que o app põe no nome de quem não está na agenda.
    causal_path:
    - parse.ts#classify (autor sem tratamento do prefixo)
    evidence:
    - ref: evidence/reproduction.md
      observation: 'Export real: autores com ''~'' + U+202F; agora 0.'
    code_refs:
    - file: src/channels/whatsapp-export/parse.ts
      symbol: classify
      commit: 0cfee41
  reproduction_tests:
  - test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > tira o prefixo ~ de quem não está na agenda (BUG-5)
  regression_tests:
  - test/unit/whatsapp-export/real-exports.test.ts (tildeAuthors = 0)
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
  artifact: _reversa_sdd/addenda/bug-BUG-20261123-5UZC-v001.md
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

# Prefixo "~" de contato fora da agenda entra no nome do autor

## Summary
Autores que não estão na agenda aparecem como `~` + U+202F + nome do perfil.

## Expected Behavior
Spec-gap parcial: EC-06 manda gravar o nome exibido; o `~` é um marcador do app, não parte do nome.

## Actual Behavior
A citação mostraria "~ Rafa" e a identidade do autor fica diferente de "Rafa".

## Steps to Reproduce
1. Export com `22/11/2026 09:05 - ~<U+202F>Rafa: valeu`
2. Importar
3. Autor gravado como `~ Rafa`.

## Evidence
- `evidence/intake.md` (aponta o relato; contagens da execução a seco sobre o export real local)

## Suspected Area
- `src/channels/whatsapp-export/parse.ts#classify`

## Acceptance Criteria
- O prefixo `~` (com espaço comum ou U+202F) é removido do nome do autor

## Traceability
- Specs: `_reversa_sdd/sdd/whatsapp-export-importer.md#11. Edge Cases e Tratamento de Erros (EC-06)`
- Código afetado: `src/channels/whatsapp-export/parse.ts#classify`

## Resolution
- **Causa raiz (confirmed):** O parser não conhecia o prefixo '~' + U+202F que o app põe no nome de quem não está na agenda.
- **Veredito de spec (aprovado pelo usuário):** `spec-gap`; adendo `_reversa_sdd/addenda/bug-BUG-20261123-5UZC-v001.md`
- **resolution_kind:** `fixed` (closure `local-software`: regressão passando + veredito)

| CHG | tipo | artefato | propósito |
|-----|------|----------|-----------|
| CHG-001 | test | `test/fixtures/whatsapp-export/android-pt-br-formas-reais.txt, test/unit/whatsapp-export/parse.test.ts, test/unit/whatsapp-export/importer.test.ts, test/unit/whatsapp-export/real-exports.test.ts` | Fixture sintética anônima com as formas reais, testes de reprodução e teste local sobre exports/ |
| CHG-002 | code | `src/channels/whatsapp-export/parse.ts` | Formato travado pelo primeiro cabeçalho; vazias ignoradas; Mensagem apagada; marcador de edição; prefixo ~ |
| CHG-003 | specification | `_reversa_sdd/addenda/bug-BUG-20261123-5UZC-v001.md` | Adendo spec-gap aprovado |

Diffs de código: `fix/CHG-*.diff`. Diff de spec: o adendo acima.

**Prova vermelho → verde:** antes da correção, `npx vitest run --project unit test/unit/whatsapp-export` saiu com exit 1 (7 falhas); depois, 111/111 e `npm run dor` todo verde. Testes de reprodução: `test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > tira o prefixo ~ de quem não está na agenda (BUG-5)`. Regressão: `test/unit/whatsapp-export/real-exports.test.ts (tildeAuthors = 0)`.

## Agent Notes
- Severidade e prioridade propostas pelo registrador (o usuário aprovou a correção no chat sem graduar).
- Os 5 bugs deste relato nascem no mesmo parser e serão corrigidos juntos, num PR.
- Nunca copiar o export real para o repositório: ele tem dados de terceiros e o repo é público.
