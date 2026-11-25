# Onboarding: testar a busca pelo sentido (fatia S6)

> Feature: `007-achar-assunto-outras-palavras`
> Tempo estimado: 60 a 90 min (a maior parte é escrever as perguntas reais e esperar a medição)
> Este roteiro é autossuficiente: não depende dos guias das fatias anteriores.

## 0. Pré-requisitos

1. **Node 22** ativo (`node -v` mostra `v22.*`). Docker Desktop no ar.
2. **Repositório atualizado** na `main`, com a S6 mergeada, e `npm ci` rodado.
3. **Ambiente:** `npm run setup`. Ele cria ou atualiza o `.env`, preserva as chaves que já existem e sobe o container novo `palantir-embedder`. Depois, `npm run doctor` deve mostrar o embedder respondendo.
4. **Banco:** `npm run db:migrate`, que aplica a `0009`.
5. **Dados:** o T3 já importado. Se não estiver: `npm run import -- exports/<arquivo do T3>.zip --conversa "T3"`.
6. **Processos:** feche qualquer `npm run dev:worker` aberto. Nesta fatia, rode o worker sem `--watch`: `node --env-file-if-exists=.env --import tsx src/main/worker.ts`, o mesmo comando que você já usa para a transcrição.

## 1. Baixar os modelos candidatos (5 a 15 min)

```
npm run busca:modelos
```

Sem argumentos, ele baixa os candidatos da medição para o volume do motor local. Cada modelo sobe uma vez num container temporário e para. Para escolher outros, passe os ids do Hugging Face, por exemplo `npm run busca:modelos -- BAAI/bge-m3`.

Confira com `npm run doctor`.

## 2. Escrever as perguntas reais (20 a 30 min)

1. Rode `npm run eval:busca -- preparar`.
2. Abra `exports/medicao/busca/perguntas.json` (fica fora do git).
3. Escreva 15 a 20 perguntas sobre o T3 **com palavras diferentes das que foram usadas no grupo**. Para cada uma, copie em `trechos` um pedaço literal da mensagem certa.
4. Inclua 4 ou 5 perguntas sobre assuntos que **não** aparecem no T3 (`"trechos": []`), parecidas com os temas do grupo.
5. Se tiver dúvida sobre qual mensagem é a certa, pode me perguntar na conversa.

## 3. Medir e escolher o modelo (10 a 30 min)

```
npm run eval:busca -- medir
```

Veja a tabela. O melhor modelo é o que tem:
- o maior R@5 nas perguntas reais;
- Neg≥τ de até 10%;
- velocidade e memória aceitáveis.

Grave a escolha no `.env`. Os modelos `intfloat/multilingual-e5-*` usam os prefixos `"query: "` e `"passage: "`; os outros candidatos, exceto a Qwen3, usam prefixos vazios (`""`).

```
PALANTIR_EMBEDDER_MODEL=<modelo escolhido>
PALANTIR_EMBEDDER_DIMENSIONS=<da tabela>
PALANTIR_EMBEDDER_QUERY_PREFIX="<prefixo da pergunta>"
PALANTIR_EMBEDDER_DOCUMENT_PREFIX="<prefixo do trecho>"
PALANTIR_SEMANTIC_MIN_SIMILARITY=<τ sugerido>
```

Depois, rode `npm run setup` de novo: o motor local passa a servir o modelo escolhido.

## 4. Calcular o sentido do histórico (5 a 20 min)

1. Reinicie o worker sem `--watch`. O log mostra "modelo de embeddings ativo" e começa a varredura.
2. No Grafana (http://localhost:3000, painel "Busca"), os pendentes caem até zero.
3. Se o computador ficar lento por causa da transcrição do T3, pause a transcrição até terminar: `PALANTIR_TRANSCRIPTION=off` no `.env` e reinicie o worker. Depois, volte a `on`.

## 5. Conferir com números

```
npm run eval
```

O esperado:
- `parafrase` e `digitacao` sobem bem acima da coluna `palavra`;
- `exata` não cai;
- `sem_evidencia` fica em ≥ 90%;
- o total fica em ≥ 85%.

## 6. Demonstração pelo WhatsApp (10 min)

Suba o canal com `npm run dev:whatsapp` e a API, se usar. Do seu número pessoal, mande ao agente:

1. Uma pergunta real sobre o T3 **com outras palavras** (uma das que você escreveu). O agente cita a mensagem certa, com autor, conversa e data, igual às outras respostas.
2. A mesma pergunta com um erro de digitação proposital num nome de ferramenta. O agente ainda acha a mensagem.
3. "em qual áudio do T3 falaram de <assunto com outras palavras>?" O agente cita um áudio do T3, com a duração e o ponto do trecho, se esse áudio já tiver sido transcrito.
4. Uma pergunta sobre um assunto que não está no T3. O agente responde "Não encontrei evidências suficientes".
5. Uma pergunta que já funcionava com as palavras exatas (por exemplo, a da S2). A resposta continua a mesma.

## 7. Modo degradado (5 min)

1. `docker stop palantir-embedder`
2. Pergunte com as palavras exatas: o agente responde por palavra. No painel, "busca degradada" sobe.
3. Mande uma mensagem nova no grupo autorizado. Ela é encontrada por palavra.
4. `docker start palantir-embedder`. Em até 1 min, a mensagem nova passa a ser achada por paráfrase, sem você fazer nada.

## 8. Opcional: serviço online e verificador

- Não ligue o serviço online nem o verificador (Jev) com os seus dados antes do ADR sobre o envio de dados de terceiros.
- Para ver o verificador só com o conjunto sintético:
  1. ponha `PALANTIR_VERIFIER=typesafe`, `PALANTIR_VERIFIER_ALLOW_REMOTE=true` e `TYPESAFE_API_KEY=<chave>` no `.env`;
  2. rode `npm run eval -- --modo verificador`;
  3. volte a `PALANTIR_VERIFIER=off`.

## 9. Voltar atrás, se precisar

- `PALANTIR_EMBEDDER=off` no `.env` e reinicie o worker e o canal. A busca volta a ser só por palavra, sem perder nada.
- Os vetores ficam no banco e voltam a valer quando você religar.
