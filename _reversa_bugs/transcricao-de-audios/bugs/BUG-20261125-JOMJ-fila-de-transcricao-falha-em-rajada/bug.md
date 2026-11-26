---
schema_version: 1
id: BUG-20261125-JOMJ
display_number: 8
title: Prazo não inteiro faz a transcrição falhar antes de chamar o motor
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
  rate: 34/34
  suspected_triggers:
  - duração em segundos cujo produto por 3.000 não é inteiro em ponto flutuante (ex. 236,060 s)
blocking: []
relationships:
- bug: BUG-20261125-B4B3
  type: caused-by
  state: rejected
  evidence:
  - evidence/reproduction.md (a falha acontece em 6 ms, antes do pedido sair, e se repete com o motor ocioso)
traceability:
  specs:
  - _reversa_sdd/sdd/media-transcription.md#11. Edge Cases e Tratamento de Erros (EC-02, EC-03)
  - _reversa_sdd/addenda/005-perguntar-sobre-audios.md#Impacto por artefato da extração
  - _reversa_forward/005-perguntar-sobre-audios/interfaces/job-media-process.md (retryLimit 3, retryDelay 10 s com backoff)
  affected_code:
  - src/modules/media/infrastructure/transcribers/openai-compatible.ts#call
  - src/main/media.ts#startMediaWorker
  - src/modules/media/application/process-attachment.ts#run
  root_cause:
    state: confirmed
    hypothesis: O adaptador calcula o prazo como max(120 s, duração × 3 × 1000 ms). Com durações decimais, o produto em ponto flutuante sai não inteiro (236,06 × 3000 = 708180,0000000001), e AbortSignal.timeout lança RangeError. Como o sinal é criado dentro de call(), o erro é classificado como unavailable, o pg-boss tenta de novo e falha igual, e o anexo vira failed sem o pedido sair da máquina.
    causal_path:
    - pg-media-repository.ts (duration_s numeric vira Number com decimais)
    - openai-compatible.ts#transcribe (timeout = duração × 3 × 1000, sem arredondar)
    - AbortSignal.timeout (RangeError ERR_OUT_OF_RANGE para valor não inteiro)
    - openai-compatible.ts#call (todo erro que não é cancelamento vira unavailable)
    - process-attachment.ts#run (unavailable é tentado de novo; na última, failed)
    evidence:
    - ref: evidence/reproduction.md
      observation: 'b189d61b: prazo 708180.0000000001, RangeError; adaptador real falha em 6 ms sem chamar o transporte. 126 done com prazo inteiro, 34 failed com prazo não inteiro.'
    - ref: evidence/observacoes.md
      observation: As rajadas (63 falhas em 31 s às 10:34, 41 às 10:40) nunca chegaram ao log do motor.
    code_refs:
    - file: src/modules/media/infrastructure/transcribers/openai-compatible.ts
      symbol: transcribe
      commit: a55fad1
  reproduction_tests:
  - 'test/unit/media/transcribers.test.ts > adaptador openai-compatible > BUG-20261125-JOMJ: duração decimal (%s s) não quebra o prazo; a chamada chega ao motor (236.06, 361.1, 40.05)'
  - evidence/reproduction.md (adaptador real com o áudio de 236 s)
  regression_tests:
  - test/unit/media/transcribers.test.ts > adaptador openai-compatible > prazo estourado vira timeout; motor fora do ar vira unavailable
  - 'test/unit/media/transcribers.test.ts > adaptador openai-compatible > BUG-20261125-B4B3: sem o fetch global, o prazo do adaptador continua virando timeout e o motor fora do ar, unavailable'
spec_verdict: spec-correta
change_set:
- id: CHG-001
  kind: test
  artifact: test/unit/media/transcribers.test.ts
  purpose: Reprodução com durações cujo prazo dá não inteiro
  diff: fix/CHG-001.diff
- id: CHG-002
  kind: code
  artifact: src/modules/media/infrastructure/transcribers/openai-compatible.ts
  purpose: Math.ceil no prazo
  diff: fix/CHG-002.diff
- id: CHG-003
  kind: data-repair
  artifact: attachments (34 áudios failed/unavailable)
  purpose: Devolver à fila, com backup em fix/data-repair-backup.tsv e volta atrás em fix/data-repair.md
delivery:
  branch: fix/005-transcricao-longa
data_repair:
  backup: fix/data-repair-backup.tsv
  applied_at: '2026-11-25'
  rows: 34
  rollback: fix/data-repair.md
closure:
  policy: local-software
  satisfied: true
resolution_kind: fixed
change_risk:
  classification: baixa
  motivos:
  - arredondamento de um número no adaptador e a ordem de duas linhas
  - sem contrato, schema nem dependência
  - reversível com revert; coberto por teste unitário
data_impact:
  description: 34 áudios do T3 (32 curtos e os 2 longos de 236 s e 361 s) estão failed/unavailable sem nunca terem chegado ao motor e precisam voltar à fila depois da correção.
---

# Depois de um corte, a fila de transcrição inteira falha em segundos

## Summary

Logo depois que uma chamada longa é cortada, as chamadas seguintes ao motor falham quase na hora. Cada job gasta as 3 novas tentativas em cerca de 1 min, e áudios curtos, que o motor transcreveria em segundos, viram `failed` em rajada. O motor ainda gasta CPU transcrevendo o áudio que o worker abandonou.

## Expected Behavior

- `media-transcription` EC-02: falha ou timeout do motor leva a 3 novas tentativas com recuo, e só então a `failed`.
- `media-transcription` EC-03: o backlog é processado com a concorrência configurada (aqui, 1).
- A spec não diz o que fazer quando o motor fica indisponível por mais que a janela das tentativas, nem com a transcrição que o cliente abandonou: `spec-gap` a confirmar no fix.
- Esperado pelo uso: uma indisponibilidade passageira do motor não deveria transformar a fila inteira em falha definitiva.

## Actual Behavior

- Às 10:34:25, no instante em que a chamada longa foi cortada, começaram falhas imediatas: uma a cada ~0,5 s, o intervalo de busca da fila, até 10:34:56 (63 falhas).
- O mesmo às 10:40 (41 falhas), depois do corte seguinte.
- Nenhuma dessas chamadas aparece no log do motor.
- 35 áudios terminaram `failed/unavailable` em duas rajadas (10:40:46-10:40:59 e 10:46:05-10:46:17), 32 deles com menos de 210 s.
- O motor processou trechos de vários áudios ao mesmo tempo (13:39-14:29 UTC), com a concorrência do worker em 1: transcrições abandonadas continuam rodando.

## Steps to Reproduce

1. Com a correção do BUG-20261125-B4B3 ainda ausente, devolver à fila um áudio longo (> 3,5 min) e vários curtos.
2. Esperar o corte de 300 s do áudio longo.
3. Observar as falhas imediatas das chamadas seguintes e os anexos curtos virando `failed`.

Ainda falta isolar a falha imediata (que erro o undici devolve e por quê).

## Evidence

- `evidence/observacoes.md`
- Relato: `../../intake/relato-20261125-1819.md` (Problema 2)

## Suspected Area

- `openai-compatible.ts#call`: toda falha de conexão vira `unavailable` sem distinguir a causa.
- Política de novas tentativas do `media.process` (`src/main/media.ts`): 3 tentativas com 10 s e recuo.
- O motor (Speaches) não cancela a transcrição quando o cliente desiste.

## Acceptance Criteria

- Uma indisponibilidade curta do motor não esgota as tentativas da fila inteira em segundos.
- Uma chamada abandonada pelo worker não deixa o motor trabalhando sem ninguém esperando, ou isso deixa de derrubar as chamadas seguintes.
- Os 32 áudios curtos do T3 voltam à fila e terminam `done`.

## Traceability

- Specs: `media-transcription.md#11` (EC-02, EC-03), adendo 005, `interfaces/job-media-process.md`.
- Código: `openai-compatible.ts#call`, `src/main/media.ts#startMediaWorker`, `process-attachment.ts#run`.
- Testes existentes: `test/unit/media/process-attachment.test.ts`, `test/unit/media/transcribers.test.ts`, `test/integration/media-pipeline.test.ts`.

## Resolution

**Causa raiz (confirmed):** o prazo `max(120 s, duração × 3 × 1000 ms)` sai não inteiro para durações decimais em ponto flutuante, e o `AbortSignal.timeout` lança `RangeError`. Criado dentro de `call()`, o erro vira `unavailable`; o pg-boss tenta de novo, falha igual, e o anexo vira `failed` sem o pedido sair. A hipótese `caused-by` BUG-20261125-B4B3 foi rejeitada.

**Veredito de spec:** `spec-correta`, aprovado pelo usuário em 2026-11-25. A EC-02 e a `interfaces/transcriber.md` definem o prazo como o maior entre 120 s e 3× a duração; o código divergiu no arredondamento. Nenhum adendo.

**resolution_kind:** `fixed`.

| CHG | tipo | artefato | propósito |
|-----|------|----------|-----------|
| CHG-001 | test | `test/unit/media/transcribers.test.ts` | reprodução com durações de prazo não inteiro |
| CHG-002 | code | `src/modules/media/infrastructure/transcribers/openai-compatible.ts` | `Math.ceil` no prazo |
| CHG-003 | data-repair | `attachments` | 34 áudios de volta à fila |

**Prova:**
- Vermelho: `transcribers.test.ts` com 3 falhas (`TranscriberError: o motor de transcrição não está acessível`) e 15 aprovações. Adaptador real: `falhou em 6 ms`.
- Verde: `transcribers.test.ts` com 18 aprovações. Adaptador real com o motor: `ok em 274 s; segmentos=94` (`evidence/depois.txt`).

**Observação fora do change set:** `call()` classifica como `unavailable` todo erro que não é cancelamento, inclusive erro de programação. Foi isso que escondeu o defeito. Mudar exige decidir o destino do anexo nesses casos.

**Fechamento (2026-11-25):** com o worker no código novo, os 34 áudios devolvidos à fila terminaram `done` entre 20:10 e 21:18, sem nenhuma falha. Resultado final: 160 de 160 áudios `done`, todos com transcrição ativa.

## Diagnóstico (2026-11-25, depois da correção do #7)

A hipótese inicial (o corte de 300 s deixaria o motor ocupado e derrubaria as chamadas seguintes) foi **rejeitada**. Com o #7 corrigido, os áudios de 436 s e 461 s terminaram `done`, e os de 236 s e 361 s falharam em milissegundos, com o motor ocioso. A falha acontece antes do pedido sair: o prazo calculado não é inteiro e o `AbortSignal.timeout` lança `RangeError`. As "rajadas" eram só a fila andando: enquanto o worker estava preso no áudio longo, os outros esperavam; liberado, os de prazo quebrado falhavam um atrás do outro.

O que o #8 tinha observado de verdade sobre o motor (várias transcrições ao mesmo tempo) vinha dos cortes do #7: o worker desistia e o Speaches seguia transcrevendo. Com o #7 corrigido, o worker não desiste antes do prazo.

## Agent Notes

- Relação `caused-by` BUG-20261125-B4B3 é hipótese: corrigir o 7 pode remover o gatilho, mas a janela curta de tentativas continua frágil a qualquer queda de ~1 min do motor.
- Antes de mudar código, reproduzir a falha imediata e registrar a causa exata do erro do undici (o log do worker guarda só `err.name`, por privacidade; dá para registrar também `err.cause.code`, que não tem conteúdo).
- Taxonomia: proposta de incluir a feature `005-perguntar-sobre-audios` em `taxonomy.yaml`.
