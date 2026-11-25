# Regression watch: Achar o mesmo assunto dito com outras palavras (fatia S6)

> Identificador: `007-achar-assunto-outras-palavras`
> Feature greenfield: nenhuma regra 🟢 extraída de código para vigiar ainda.

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|-------------------------|-----------------------------|---------------------|-------------------|

(vazio até uma extração `/reversa` confirmar as regras abaixo como 🟢)

## Observações

| ID | Origem | Regra implementada | Verificada por |
|----|--------|--------------------|----------------|
| W001 | `requirements.md#RN-01`, `RF-01`, `RF-06` | Todo trecho com texto ou transcrição ganha o vetor do modelo ativo, inclusive o histórico guardado antes da S6; a citação continua sendo a mensagem original | `test/integration/embedding-repository.test.ts`, `test/e2e/semantic-search.test.ts` |
| W002 | `requirements.md#RN-02` (D-07) | Cada forma de busca filtra espaço, tipo, fonte e exclusão dentro da própria consulta; dois espaços nunca cruzam resultados | `test/integration/hybrid-search.test.ts` |
| W003 | `requirements.md#RN-03` | A palavra exata não regride: os casos `exata` do eval acertam, e a mensagem com os termos da pergunta fica entre as citadas | `scripts/eval.ts` (regressão de palavra exata), `test/integration/hybrid-search.test.ts` |
| W004 | `requirements.md#RN-04`, `RF-05` (D-08) | Só é citado o que passa no próprio limiar; vizinhança fraca dá "não encontrei"; meta de ≥ 90% no eval | `test/unit/knowledge-retrieval/fusion.test.ts`, `npm run eval` |
| W005 | `requirements.md#RN-05`, `RF-13` (D-01, D-03) | O cálculo de sentido fica atrás da porta `Embedder`; serviço online só com `PALANTIR_EMBEDDER_ALLOW_REMOTE=true`; trocar de motor não muda o núcleo | `test/unit/platform/search-config.test.ts`, regra `embedder-engine-isolated` |
| W006 | `requirements.md#RN-06`, `RF-08` (D-13) | O modelo sai da medição na máquina do usuário, com os conjuntos sintético e real, e a saída tem só números | `test/unit/scripts/busca-core.test.ts`, `npm run eval:busca -- medir` |
| W007 | `requirements.md#RN-07`, `RF-07` (D-05, D-09) | Sem o motor, a indexação por palavra segue, o sentido fica pendente e a busca marca `degraded`; ao voltar, a varredura completa sem ação manual | `test/unit/knowledge-retrieval/embed-sweep.test.ts`, `test/e2e/semantic-search.test.ts` |
| W008 | `requirements.md#RN-08` (D-04) | Os vetores caem em cascata com o trecho, a mensagem e a fonte; trecho de modelo não ativo não entra na busca; a dimensão é conferida antes de gravar | `test/integration/semantic-schema.test.ts`, `test/unit/knowledge-retrieval/embedders.test.ts` |
| W009 | `requirements.md#RN-09`, `RF-14` (D-10) | O verificador externo fica desligado por padrão, exige liberação e chave, cita só p ≥ 0,7 e degrada sem ele | `test/unit/knowledge-retrieval/hybrid-search.test.ts`, `test/unit/knowledge-retrieval/typesafe-verifier.test.ts` |
| W010 | `requirements.md#RN-10`, `RF-12` | A mensagem achada pelo sentido é citada como as outras, sem aviso nem ordem separada | `test/e2e/semantic-search.test.ts` |
| W011 | `requirements.md#RF-04` | O erro de digitação acha a palavra por trigramas e pode ser desligado com `PALANTIR_TYPO_SEARCH=off` | `test/integration/hybrid-search.test.ts`, `npm run eval` (`digitacao`) |
| W012 | `requirements.md#RF-10` (D-06) | Uma troca de modelo nasce em construção e só ativa quando completa; a ativação aposenta o anterior e cria o índice parcial | `test/integration/embedding-repository.test.ts` |
| W013 | `requirements.md#RF-11` (D-14) | Métricas e painel sem texto; alertas de pendentes parados e de motor fora do ar | `test/unit/knowledge-retrieval/otel-search-observers.test.ts`, `promtool check rules` |
| W014 | `requirements.md#6` (privacidade) | Logs sem texto de mensagem, de pergunta nem vetores; perguntas reais só em `exports/` | `test/e2e/semantic-search.test.ts` |

## Histórico de re-extrações

(vazio)

## Arquivadas

(vazio)
