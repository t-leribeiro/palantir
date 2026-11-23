---
schema_version: 1
id: BUG-20261123-S57G
display_number: 6
title: Legenda de mídia é descartada na importação e não fica pesquisável
status: resolved
phase: delivering
severity: medium
priority: P1
created: 2026-11-23
updated: '2026-11-23'
express: true
origin:
  type: manual-report
  external_ref: null
area: channels
module: whatsapp-export-importer
feature: 002-perguntar-historico-importado
labels:
- spec-gap
- perda-de-conteudo
visibility: normal
security_suspected: false
reproduction:
  classification: deterministic
  rate: 1/1
  suspected_triggers:
  - mensagem de anexo com legenda na linha seguinte
blocking: []
relationships:
- type: related-to
  bug: BUG-20261123-6E3T
  state: supported
traceability:
  specs:
  - _reversa_sdd/sdd/whatsapp-export-importer.md#3. Goals (Objetivos) (G-01)
  - _reversa_sdd/sdd/whatsapp-export-importer.md#6.1 Requisitos Principais (RF-03, RF-09)
  - _reversa_forward/002-perguntar-historico-importado/requirements.md#RF-05
  affected_code:
  - src/channels/whatsapp-export/parse.ts#appendContinuation
  - src/channels/whatsapp-export/parse.ts#parseExport
  root_cause:
    state: confirmed
    hypothesis: appendContinuation só acumulava linhas seguintes em entradas de texto; a legenda depois de um cabeçalho de anexo era descartada, e parseExport só transformava em mensagem as entradas de texto.
    causal_path:
    - parse.ts#classify (cabeçalho de anexo = kind media, texto vazio)
    - parse.ts#appendContinuation (continuação só para kind text: legenda perdida)
    - parse.ts#parseExport (só kind text vira mensagem)
    evidence:
    - ref: evidence/reproduction.md
      observation: 'Exports reais: captionsLost 209 (Contas da Casa) e 345 (T3) antes; 0 depois.'
    code_refs:
    - file: src/channels/whatsapp-export/parse.ts
      symbol: appendContinuation
      commit: 81c6f3d
  reproduction_tests:
  - test/unit/whatsapp-export/parse.test.ts > legenda de anexo (BUG-6 de _reversa_bugs/importacao-whatsapp, BUG-20261123-S57G) > anexo com legenda vira mensagem com a legenda, o autor e a data do anexo; continua contado como mídia
  - test/unit/whatsapp-export/parse.test.ts > legenda de anexo (BUG-6 ...) > vale para o export em inglês, para o iOS e para a mídia oculta
  - test/unit/whatsapp-export/parse.test.ts > legenda de anexo (BUG-6 ...) > legenda só com espaços não vira mensagem; marcador de edição sai da legenda
  regression_tests:
  - test/unit/whatsapp-export/real-exports.test.ts (captionsLost = 0)
spec_verdict: spec-gap
change_set:
- id: CHG-001
  kind: test
  artifact: test/unit/whatsapp-export/parse.test.ts, test/unit/whatsapp-export/real-exports.test.ts
  purpose: Reprodução com legendas sintéticas (Android pt-BR e en, iOS, mídia oculta) e regressão sobre os exports reais locais
  diff: fix/CHG-001.diff
- id: CHG-002
  kind: code
  artifact: src/channels/whatsapp-export/parse.ts
  purpose: Legenda de anexo acumulada na entrada de mídia e importada como mensagem de texto; anexo segue contado
  diff: fix/CHG-002.diff
- id: CHG-003
  kind: specification
  artifact: _reversa_sdd/addenda/bug-BUG-20261123-S57G-v001.md
  purpose: Adendo spec-gap aprovado
closure:
  policy: local-software
  satisfied: true
resolution_kind: fixed
data_impact:
  description: Imports feitos antes da correção não têm as legendas. Reimportar o mesmo export acrescenta só as legendas como mensagens novas (chaves novas); as demais caem como já existentes. Só há dados locais.
change_risk:
  classification: baixa
  motivos:
  - só o parser do adaptador de exportação
  - sem mudança de contrato nem de esquema
  - mensagens existentes mantêm as chaves (reimportação idempotente)
delivery:
  branch: fix/002-legendas-de-midia
  pr: null
  ci: null
  merge: null
---

# Legenda de mídia é descartada na importação e não fica pesquisável

## Summary
No export do WhatsApp, a legenda de um anexo vem na linha seguinte ao cabeçalho `<arquivo> (arquivo anexado)`. O importador conta o anexo como mídia e joga a legenda fora.

## Expected Behavior
Spec-gap: a spec do importador quer "mensagens e mídias pesquisáveis" (G-01) e a S1 decidiu importar só os textos, contando as mídias para a S4 (RF-05 da 002). Ela não diz o que fazer com a legenda, que é texto escrito pelo autor. O esperado é a legenda ficar pesquisável e citável, com autor e data do anexo, e o anexo continuar contado para a S4.

## Actual Behavior
A legenda some. No export real "Contas da Casa", as 8 menções à palavra procurada eram legendas, e a pergunta recebeu "Não encontrei evidências suficientes.".

## Steps to Reproduce
1. Export com `13/11/2026 10:00 - Ana: recibo.pdf (arquivo anexado)` seguido da linha `Recibo da psicóloga, novembro`
2. Importar
3. Nenhuma mensagem com a legenda; relatório conta 1 mídia.

## Evidence
- `evidence/intake.md` (aponta o relato; só contagens, nada do conteúdo real)
- `evidence/reproduction.md` (cápsula de reprodução e efeito nos exports reais)

## Suspected Area
- `src/channels/whatsapp-export/parse.ts#appendContinuation`
- `src/channels/whatsapp-export/parse.ts#parseExport`

## Acceptance Criteria
- Anexo com legenda gera uma mensagem de texto com a legenda, autor e data do anexo, e continua contado em "Mídias encontradas"
- Anexo sem legenda continua só contado
- Reimportar o export depois da correção acrescenta só as legendas; o resto cai como "já existentes"
- O teste sobre os exports reais locais não encontra legenda perdida

## Traceability
- Specs: `_reversa_sdd/sdd/whatsapp-export-importer.md#3. Goals (Objetivos) (G-01)`, `#6.1 Requisitos Principais (RF-03, RF-09)`; `_reversa_forward/002-perguntar-historico-importado/requirements.md#RF-05`
- Código afetado: `src/channels/whatsapp-export/parse.ts#appendContinuation`, `#parseExport`

## Resolution
- **Causa raiz (confirmed):** `appendContinuation` só acumulava linhas seguintes em entradas de texto; a legenda depois de um cabeçalho de anexo era descartada, e `parseExport` só transformava em mensagem as entradas de texto.
- **Veredito de spec (aprovado pelo usuário):** `spec-gap`; adendo `_reversa_sdd/addenda/bug-BUG-20261123-S57G-v001.md`
- **resolution_kind:** `fixed` (closure `local-software`: regressão passando + veredito)

| CHG | tipo | artefato | propósito |
|-----|------|----------|-----------|
| CHG-001 | test | `test/unit/whatsapp-export/parse.test.ts`, `test/unit/whatsapp-export/real-exports.test.ts` | Reprodução com legendas sintéticas e regressão sobre os exports reais locais |
| CHG-002 | code | `src/channels/whatsapp-export/parse.ts` | Legenda de anexo acumulada na entrada de mídia e importada como mensagem de texto; anexo segue contado |
| CHG-003 | specification | `_reversa_sdd/addenda/bug-BUG-20261123-S57G-v001.md` | Adendo spec-gap aprovado |

Diffs de código: `fix/CHG-*.diff`. Diff de spec: o adendo acima.

**Prova vermelho → verde:**
- **Antes:** `npx vitest run test/unit/whatsapp-export` saiu com exit 1 (5 falhas: 3 de reprodução; 2 de regressão, com `captionsLost` 209 e 345).
- **Depois:** 42/42; `npm test` 226 passaram e integração 19.

## Agent Notes
- Rota expressa: severidade `medium` e prioridade `P1` assumidas pelo registrador (perda silenciosa de conteúdo citável; o usuário pediu a correção, sem graduar).
- Nunca copiar o export real para o repositório: dados de terceiros, repositório público. Fixture sintética.
- A S4 vai vincular o arquivo do anexo à mesma mensagem; esta correção não guarda mídia.
- Relação com BUG-20261123-6E3T `supported`: mesmo ponto do parser (classificação de mensagens sem texto antes de anexos).
