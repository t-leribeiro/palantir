# Interface: comandos de medição e avaliação, e as variáveis de ambiente

> Feature: `007-achar-assunto-outras-palavras` · Decisões D-03, D-12, D-13

## 1. `npm run busca:modelos -- <id> [<id>...]` (novo)

Baixa modelos no motor local (`ollama pull` via API `POST /api/pull`). O comando:
- mostra o progresso em porcentagem e o tamanho;
- não carrega o modelo na memória;
- recusa quando `PALANTIR_EMBEDDER_URL` não é local.

```
$ npm run busca:modelos -- bge-m3 qwen3-embedding:0.6b
bge-m3 ................ 100% (1,2 GB)
qwen3-embedding:0.6b .. 100% (0,6 GB)
```

## 2. `npm run eval:busca -- preparar` (novo)

Cria `exports/medicao/busca/` (fora do git) com:
- `LEIAME.txt`: como escrever as perguntas;
- `perguntas.json`: o modelo a preencher.

O arquivo fica assim:

```json
{
  "conversa": "T3",
  "perguntas": [
    { "pergunta": "quem sugeriu algo para baratear a nuvem?", "trechos": ["reduziu em 30% o custo"], "tipo": "parafrase" },
    { "pergunta": "alguém falou de computação quântica?", "trechos": [], "tipo": "sem_evidencia" }
  ]
}
```

- `trechos` são pedaços literais das mensagens esperadas: a ferramenta acha a mensagem pelo trecho. Lista vazia marca uma pergunta sem evidência.
- Se um trecho casa com mais de uma mensagem, ou com nenhuma, o `medir` avisa pelo número da pergunta, sem mostrar o texto.

## 3. `npm run eval:busca -- medir [--modelos a,b] [--conversa T3]` (novo)

1. Lê do banco local, só lendo, os trechos da conversa e resolve os `trechos` para ids de mensagem.
2. Para cada modelo, um por vez:
   - carrega o modelo;
   - calcula em memória o sentido dos trechos da conversa e das perguntas;
   - calcula as métricas;
   - descarrega o modelo (`keep_alive: 0`) e confirma que a memória baixou, antes do próximo.
3. Repete no conjunto sintético (`eval/cases.json`).
4. Grava `exports/medicao/busca/resultado.json` e imprime a tabela:

```
Conjunto  Modelo                 R@1   R@5   R@10  MRR   Neg≥τ  τ sugerido  msg/s  Memória
real      bge-m3                 0,55  0,80  0,90  0,66  10%    0,58        38     1,4 GB
real      qwen3-embedding:0.6b   ...
sintético bge-m3                 ...
```

- **R@k:** fração das perguntas com evidência cuja mensagem esperada está entre as k primeiras, só pelo sentido.
- **Neg≥τ:** fração das perguntas sem evidência com alguma mensagem acima do limiar sugerido.
- **τ sugerido:** o menor limiar que deixa ≥ 90% das perguntas sem evidência sem resposta, arredondado para 0,01.
- A saída nunca mostra pergunta, trecho, nome de pessoa nem texto de mensagem: só números, nomes de modelo e o número da pergunta.
- Um serviço online configurado (`--modelos voyage:voyage-4`) entra na mesma tabela só com `PALANTIR_EMBEDDER_ALLOW_REMOTE=true`. Com as perguntas reais, isso exige o ADR de dados de terceiros, e o comando avisa.

## 4. `npm run eval` (alterado)

- Cada caso de `eval/cases.json` ganha `type`: `exata`, `parafrase`, `digitacao`, `audio` ou `sem_evidencia`. Os 32 casos atuais viram `exata` e `sem_evidencia`, e entram ~30 casos novos.
- `--modo palavra | combinada | verificador` roda um modo só. Sem a opção, roda `palavra` e `combinada` (mais `verificador`, se configurado) e compara.
- O comando usa o embedder do `.env`. Sem o motor no ar, avisa e roda só `palavra`.

```
Tipo           Casos  palavra  combinada  verificador
exata            24    100,0%     100,0%       –
parafrase        14     14,3%      85,7%       –
digitacao         6      0,0%      83,3%       –
audio             4     50,0%     100,0%       –
sem_evidencia    14     85,7%      92,9%       –
Total            62     ...        ...
Metas: total ≥ 85%, sem_evidencia ≥ 90%, exata sem regressão.
Relatório: reports/eval.json
```

Os números acima são ilustrativos.

## 5. Variáveis de ambiente novas (gravadas pelo `npm run setup`)

| Variável | Padrão | Uso |
|----------|--------|-----|
| `PALANTIR_EMBEDDER` | `openai-compatible` | `openai-compatible`, `voyage`, `fake` ou `off` |
| `PALANTIR_EMBEDDER_URL` | `http://127.0.0.1:11434` | Fora da máquina exige `ALLOW_REMOTE` |
| `PALANTIR_EMBEDDER_MODEL` | o escolhido na medição (o setup grava um candidato inicial) | |
| `PALANTIR_EMBEDDER_DIMENSIONS` | a do modelo | De 1 a 2.000 |
| `PALANTIR_EMBEDDER_QUERY_PREFIX`, `PALANTIR_EMBEDDER_DOCUMENT_PREFIX` | vazios | Para modelos que pedem prefixo |
| `PALANTIR_EMBEDDER_API_KEY` | vazio | Só para os serviços online |
| `PALANTIR_EMBEDDER_ALLOW_REMOTE` | `false` | Liberação explícita (RN-05) |
| `PALANTIR_SEMANTIC_MIN_SIMILARITY` | vazio (0,5 com aviso) | O `τ sugerido` da medição |
| `PALANTIR_TYPO_MIN_SIMILARITY` | `0.6` | Limiar dos trigramas |
| `PALANTIR_VERIFIER` e afins | `off` | Ver `verificador-externo.md` |

O `npm run doctor` passa a conferir se o container `palantir-embedder` responde e se o modelo configurado foi baixado.

> Execução (2026-11-25):
> - **`busca:modelos`:** sobe um container temporário do TEI (`:8092`, mesmo volume de modelos) para cada id até ele responder, e para o container em seguida. Sem argumentos, baixa os candidatos da medição.
> - **`eval:busca -- medir`:** mede os modelos locais, um por vez. Serviços online ficam de fora até o ADR de dados de terceiros.
> - **Variáveis novas:** `PALANTIR_EMBEDDER_REQUEST_DIMENSIONS` e `PALANTIR_TYPO_SEARCH`; a URL padrão do motor local é `http://127.0.0.1:8091`.
> - **Eval:** o modo `palavra` desliga também a palavra parecida (linha de base da S5).
