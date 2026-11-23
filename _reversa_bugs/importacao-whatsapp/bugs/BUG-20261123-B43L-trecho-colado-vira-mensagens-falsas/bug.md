---
schema_version: 1
id: BUG-20261123-B43L
display_number: 1
title: Trecho de outra conversa colado numa mensagem vira mensagens falsas
status: resolved
phase: delivering
severity: high
priority: P1
created: 2026-11-23
updated: '2026-11-23'
origin:
  type: manual-report
  external_ref: null
area: channels
module: whatsapp-export-importer
feature: 002-perguntar-historico-importado
labels:
- evidencia
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
  - _reversa_forward/002-perguntar-historico-importado/requirements.md#RF-02
  affected_code:
  - src/channels/whatsapp-export/parse.ts#parseHeader
  root_cause:
    state: confirmed
    hypothesis: parseHeader testava os dois formatos (iOS e Android) em toda linha, sem considerar o formato do arquivo; uma linha colada no outro formato virava cabeçalho.
    causal_path:
    - parse.ts#parseExport
    - parse.ts#parseHeader (IOS.exec antes de ANDROID.exec em toda linha)
    - importer.ts gera CanonicalMessage por mensagem
    evidence:
    - ref: evidence/reproduction.md
      observation: 'Export real: 36 linhas [dd/mm/aaaa hh:mm] dentro de export Android viravam mensagens; após travar o formato, 0 mensagens fora de ordem cronológica.'
    code_refs:
    - file: src/channels/whatsapp-export/parse.ts
      symbol: parseExport
      commit: 0cfee41
  reproduction_tests:
  - test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > trecho colado em outro formato continua na mensagem de quem colou (BUG-1)
  - test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > export do iOS com linha colada no formato do Android também não se divide
    (BUG-1)
  regression_tests:
  - test/unit/whatsapp-export/real-exports.test.ts (outOfOrder = 0)
  - test/unit/whatsapp-export/parse.test.ts > Android pt-BR, Android en, iOS pt-BR, iOS en
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
- id: CHG-004
  kind: configuration
  artifact: .gitignore
  purpose: exports/ fora do git (dados reais de terceiros, repositório público)
  diff: fix/CHG-004.diff
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

# Trecho de outra conversa colado numa mensagem vira mensagens falsas

## Summary
Num export Android, linhas no formato iOS coladas dentro de uma mensagem são lidas como cabeçalhos de mensagens novas.

## Expected Behavior
RF-02: mensagens multilinha viram uma mensagem só, com 100% das linhas corretas. Um trecho colado é parte do texto de quem colou.

## Actual Behavior
Cada linha `[dd/mm/aaaa hh:mm] Nome: texto` do trecho colado vira uma mensagem própria, atribuída a `Nome` na data do trecho. No export real: 36 mensagens falsas. O agente citaria como fonte algo que nunca foi dito no grupo.

## Steps to Reproduce
1. Export Android com uma mensagem cujo texto contém linhas `[20/11/2026 14:10] Bia: ...`
2. `npm run import -- <arquivo> --conversa X`
3. As linhas coladas aparecem como mensagens de Bia em 20/11.

## Evidence
- `evidence/intake.md` (aponta o relato; contagens da execução a seco sobre o export real local)

## Suspected Area
- `src/channels/whatsapp-export/parse.ts#parseHeader`

## Acceptance Criteria
- Num export Android, linha no formato iOS é continuação da mensagem anterior (e vice-versa)
- O export real local não produz mensagens fora de ordem cronológica

## Traceability
- Specs: `_reversa_sdd/sdd/whatsapp-export-importer.md#6.1 Requisitos Principais (RF-02)`; `_reversa_forward/002-perguntar-historico-importado/requirements.md#RF-02`
- Código afetado: `src/channels/whatsapp-export/parse.ts#parseHeader`

## Resolution
- **Causa raiz (confirmed):** parseHeader testava os dois formatos (iOS e Android) em toda linha, sem considerar o formato do arquivo; uma linha colada no outro formato virava cabeçalho.
- **Veredito de spec (aprovado pelo usuário):** `spec-correta`; nada muda na spec
- **resolution_kind:** `fixed` (closure `local-software`: regressão passando + veredito)

| CHG | tipo | artefato | propósito |
|-----|------|----------|-----------|
| CHG-001 | test | `test/fixtures/whatsapp-export/android-pt-br-formas-reais.txt, test/unit/whatsapp-export/parse.test.ts, test/unit/whatsapp-export/importer.test.ts, test/unit/whatsapp-export/real-exports.test.ts` | Fixture sintética anônima com as formas reais, testes de reprodução e teste local sobre exports/ |
| CHG-002 | code | `src/channels/whatsapp-export/parse.ts` | Formato travado pelo primeiro cabeçalho; vazias ignoradas; Mensagem apagada; marcador de edição; prefixo ~ |
| CHG-004 | configuration | `.gitignore` | exports/ fora do git (dados reais de terceiros, repositório público) |

Diffs de código: `fix/CHG-*.diff`. Diff de spec: nenhum (spec-correta).

**Prova vermelho → verde:** antes da correção, `npx vitest run --project unit test/unit/whatsapp-export` saiu com exit 1 (7 falhas); depois, 111/111 e `npm run dor` todo verde. Testes de reprodução: `test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > trecho colado em outro formato continua na mensagem de quem colou (BUG-1)`; `test/unit/whatsapp-export/parse.test.ts > formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp) > export do iOS com linha colada no formato do Android também não se divide (BUG-1)`. Regressão: `test/unit/whatsapp-export/real-exports.test.ts (outOfOrder = 0)`; `test/unit/whatsapp-export/parse.test.ts > Android pt-BR, Android en, iOS pt-BR, iOS en`.

## Agent Notes
- Severidade e prioridade propostas pelo registrador (o usuário aprovou a correção no chat sem graduar).
- Os 5 bugs deste relato nascem no mesmo parser e serão corrigidos juntos, num PR.
- Nunca copiar o export real para o repositório: ele tem dados de terceiros e o repo é público.
