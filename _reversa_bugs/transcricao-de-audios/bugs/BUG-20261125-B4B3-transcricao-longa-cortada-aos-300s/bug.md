---
schema_version: 1
id: BUG-20261125-B4B3
display_number: 7
title: Transcrição longa cortada aos 300 s pelo fetch do Node
status: resolved
phase: delivering
severity: high
priority: P1
created: 2026-11-25
updated: '2026-11-25'
origin:
  type: manual-report
  external_ref: null
area: core
module: media-transcription
feature: unclassified
labels:
- timeout
- transcricao
visibility: normal
security_suspected: false
reproduction:
  classification: deterministic
  rate: 4/4
  suspected_triggers:
  - transcrição que leva mais de 300 s para o motor começar a responder
blocking: []
relationships: []
traceability:
  specs:
  - _reversa_sdd/sdd/media-transcription.md#11. Edge Cases e Tratamento de Erros (EC-02)
  - _reversa_sdd/addenda/005-perguntar-sobre-audios.md#Impacto por artefato da extração
  - _reversa_forward/005-perguntar-sobre-audios/interfaces/transcriber.md (Prazo, tabela de erros)
  affected_code:
  - src/modules/media/infrastructure/transcribers/openai-compatible.ts#transcribe
  - src/modules/media/infrastructure/transcribers/openai-compatible.ts#call
  root_cause:
    state: confirmed
    hypothesis: O fetch global do Node 22 (undici 6.29.1) tem headersTimeout padrão de 300 s, que vence antes do prazo de 3× a duração que o adaptador passa por AbortSignal; o erro resultante (TypeError com causa UND_ERR_HEADERS_TIMEOUT) cai no ramo genérico de call() e vira unavailable.
    causal_path:
    - openai-compatible.ts#transcribe (AbortSignal.timeout de 3× a duração)
    - fetch global do Node (dispatcher padrão do undici, headersTimeout 300 s)
    - openai-compatible.ts#call (TypeError sem DOMException vira unavailable)
    evidence:
    - ref: evidence/observacoes.md
      observation: Servidor de teste que responde em 320 s faz o fetch falhar aos 300 s; no motor, os áudios de 7:15 e 7:40 recomeçam a cada ~6 min.
    - ref: evidence/reproduction.md
      observation: 'Adaptador real com prazo de 1.200 s e servidor que responde em 320 s: antes, falhou em 302 s com kind=unavailable (evidence/antes.txt); depois da correção, ok em 320 s (evidence/depois.txt).'

    code_refs:
    - file: src/modules/media/infrastructure/transcribers/openai-compatible.ts
      symbol: call
      commit: a55fad1
  reproduction_tests:
  - 'test/unit/media/transcribers.test.ts > adaptador openai-compatible > BUG-20261125-B4B3: não depende do fetch global do Node, que corta a resposta do motor aos 300 s'
  - evidence/reproduction.md (cápsula de 320 s, fora da esteira)
  regression_tests:
  - 'test/unit/media/transcribers.test.ts > adaptador openai-compatible > BUG-20261125-B4B3: sem o fetch global, o prazo do adaptador continua virando timeout e o motor fora do ar, unavailable'
  - test/unit/media/transcribers.test.ts (testes existentes do adaptador, com servidor HTTP real)
spec_verdict: spec-correta
change_set:
- id: CHG-001
  kind: test
  artifact: test/unit/media/transcribers.test.ts
  purpose: Reprodução (o adaptador não usa o fetch global) e regressão (timeout, unavailable e saúde pelo transporte novo)
  diff: fix/CHG-001.diff
- id: CHG-002
  kind: code
  artifact: src/modules/media/infrastructure/transcribers/http-transport.ts
  purpose: Transporte sobre node:http e node:https sem prazo de cabeçalhos, com a assinatura do fetch
  diff: fix/CHG-002.diff
- id: CHG-003
  kind: code
  artifact: src/modules/media/infrastructure/transcribers/openai-compatible.ts
  purpose: Usa o transporte novo por padrão; call() reconhece AbortError e TimeoutError pelo nome
  diff: fix/CHG-003.diff
- id: CHG-004
  kind: data-repair
  artifact: attachments (4 áudios failed/unavailable com 210 s ou mais)
  purpose: Devolver à fila, com backup em fix/data-repair-backup.tsv e volta atrás em fix/data-repair.md
delivery:
  branch: fix/005-transcricao-longa
closure:
  policy: local-software
  satisfied: true
resolution_kind: fixed
change_risk:
  classification: baixa
  motivos:
  - só o adaptador do motor de transcrição
  - sem mudança de contrato, schema ou dados além da devolução à fila
  - reversível com revert; coberto pelos testes do adaptador com servidor HTTP real
data_repair:
  backup: fix/data-repair-backup.tsv
  applied_at: '2026-11-25'
  rows: 4
  rollback: fix/data-repair.md
data_impact:
  description: 4 áudios do T3 (de 236 s a 461 s) estão failed/unavailable e precisam voltar à fila depois da correção.
---

# Transcrição longa cortada aos 300 s pelo fetch do Node

## Summary

Áudio cuja transcrição leva mais de 5 min nunca termina. A chamada ao motor cai aos 300 s, as 3 novas tentativas repetem o corte, e o anexo fica `failed` com o motivo `unavailable`.

## Expected Behavior

- `media-transcription` EC-02: a chamada pode durar até 3× a duração do áudio; só depois disso é falha, com 3 novas tentativas e recuo.
- `interfaces/transcriber.md`: o prazo é o maior entre 120 s e 3× a duração prevista, e estouro de prazo vira `timeout`.
- Um áudio de 7:15 tem, portanto, até 1.308 s por tentativa.

## Actual Behavior

- O `fetch` do Node desiste aos 300 s esperando os cabeçalhos da resposta, qualquer que seja o prazo do adaptador.
- O erro sai como `unavailable` ("motor não acessível"), não como `timeout`.
- O motor continua transcrevendo o áudio abandonado (ver BUG-20261125-JOMJ).

## Steps to Reproduce

1. Subir um servidor HTTP local que só responde depois de 320 s.
2. Chamar o adaptador `openai-compatible` apontando para ele, com `durationHint` de 400 s (prazo de 1.200 s).
3. Observar a falha aos ~300 s, com `kind: unavailable`.

No ambiente real: devolver à fila um áudio de mais de ~3,5 min com o `large-v3-turbo` em CPU.

## Evidence

- `evidence/observacoes.md`
- Relato: `../../intake/relato-20261125-1819.md` (Problema 1)

## Suspected Area

`src/modules/media/infrastructure/transcribers/openai-compatible.ts`: o `fetch` global sem dispatcher próprio e a classificação de erros em `call()`.

## Acceptance Criteria

- Uma transcrição que leva mais de 300 s e menos que o prazo do adaptador termina com sucesso.
- O estouro do prazo do adaptador continua virando `timeout`.
- Motor fora do ar continua virando `unavailable`.
- Os 4 áudios longos do T3 voltam à fila e terminam `done`.

## Traceability

- Specs: `media-transcription.md#11` (EC-02), adendo 005, `interfaces/transcriber.md`.
- Código: `openai-compatible.ts#transcribe` e `#call`.
- Testes existentes: `test/unit/media/transcribers.test.ts` ("prazo estourado vira timeout; motor fora do ar vira unavailable"), com fetch falso, que não passa pelo undici.

## Resolution

**Causa raiz (confirmed):** o adaptador chamava o motor com o `fetch` global do Node 22, cujo dispatcher padrão (undici 6.29.1) tem `headersTimeout` de 300 s. O Speaches só manda os cabeçalhos quando a transcrição termina, então toda transcrição acima de 5 min caía antes do prazo do adaptador (3× a duração). O erro (`TypeError`, causa `UND_ERR_HEADERS_TIMEOUT`) caía no ramo genérico de `call()` e saía como `unavailable`.

**Veredito de spec:** `spec-correta`, aprovado pelo usuário em 2026-11-25. A EC-02 da `media-transcription` e a `interfaces/transcriber.md` já definiam o prazo de 3× a duração e o estouro como `timeout`; o código divergiu por um limite implícito da plataforma. Nenhum adendo.

**resolution_kind:** `fixed`.

| CHG | tipo | artefato | propósito |
|-----|------|----------|-----------|
| CHG-001 | test | `test/unit/media/transcribers.test.ts` | reprodução e regressão |
| CHG-002 | code | `src/modules/media/infrastructure/transcribers/http-transport.ts` | transporte sem prazo de cabeçalhos |
| CHG-003 | code | `src/modules/media/infrastructure/transcribers/openai-compatible.ts` | usa o transporte; reconhece o cancelamento pelo nome |
| CHG-004 | data-repair | `attachments` | 4 áudios longos de volta à fila |

Diffs: `fix/CHG-001.diff`, `fix/CHG-002.diff`, `fix/CHG-003.diff`; reparo em `fix/data-repair.md`.

**Prova:**
- Vermelho (antes de CHG-002 e CHG-003): `transcribers.test.ts` com 2 falhas e 13 aprovações; a primeira com `TranscriberError: o motor de transcrição não está acessível`, a segunda recebendo `unavailable` no lugar de `timeout`. Cápsula: `falhou em 302 s; kind=unavailable`.
- Verde: `transcribers.test.ts` com 15 aprovações, `test/unit/media` com 61, `npm test` com 605 (4 pulados). Cápsula: `ok em 320 s; segmentos=1`.

**Fechamento (2026-11-25):** com o worker no código novo, os áudios de 436 s e 461 s terminaram `done` (antes nunca passavam dos 300 s). Os de 236 s e 361 s falharam por outra causa, o BUG-20261125-JOMJ; corrigido este, terminaram `done` também. Resultado final: 160 de 160 áudios `done`, todos com transcrição ativa.

## Agent Notes

- Taxonomia: a feature `005-perguntar-sobre-audios` não está em `taxonomy.yaml`; proposta de incluir `003` a `007`.
- O dispatcher do undici é detalhe de infraestrutura: fica no adaptador, sem vazar para o núcleo (regra `transcriber-engine-isolated`).
- Não registrar em log o áudio nem o texto.
