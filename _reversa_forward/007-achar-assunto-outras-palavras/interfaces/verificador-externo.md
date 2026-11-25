# Interface: verificador externo de evidências (porta `EvidenceVerifier`, adaptador TypeSafe)

> Feature: `007-achar-assunto-outras-palavras` · Decisões D-09, D-10, D-15 · RN-09, RF-14 (Should)
> Desligado por padrão. Com dados reais, só depois de um ADR sobre o envio de dados de terceiros.

## 1. Porta (núcleo, `retrieval/application`)

```ts
interface VerifierCandidate {
  readonly id: string;        // message_id
  readonly text: string;      // trecho citado
  readonly author: string;
  readonly sourceTitle: string;
  readonly sentAt: string;    // ISO 8601
}

interface EvidenceVerifier {
  readonly provider: string;  // "typesafe" | "fake"
  verify(question: string, candidates: readonly VerifierCandidate[], signal: AbortSignal): Promise<ReadonlyMap<string, number>>;
}
```

- Devolve a probabilidade de 0 a 1 de cada candidata sustentar a resposta à pergunta.
- Uma candidata sem resposta (erro ou prazo estourado só nela) fica fora do mapa e é tratada como não verificada.

**Uso pela busca (D-10):**
1. Depois da fusão, as até 30 primeiras candidatas vão para `verify`, com um prazo total de 2,5 s.
2. São citadas as candidatas com p ≥ `PALANTIR_VERIFIER_MIN_PROBABILITY` (0,7 de partida), ordenadas por p e depois pela posição na fusão.
3. Nenhuma ≥ 0,7 dá "não encontrei".
4. Se o verificador falhar ou estourar o prazo, vale a decisão por sinais (D-08), com `degraded: true` e `search_degraded_total{reason="verifier"}`.

## 2. Adaptador `typesafe`

- Fica em `src/modules/retrieval/infrastructure/verifiers/typesafe.ts`, isolado pela regra `verifier-engine-isolated`.
- Usa o SDK JavaScript oficial, se a ação confirmar que ele cobre o `POST /v1/systemone`; senão, `fetch`. A ação lê a referência atual da API antes de escrever o código.

**Uma requisição por candidata, com uma pergunta "Noul":**

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer {TYPESAFE_API_KEY}

{
  "model": "jev-1.14.0",
  "state": {
    "pergunta": "<pergunta do usuário>",
    "mensagem": { "autor": "...", "conversa": "...", "data": "...", "texto": "<trecho>" }
  },
  "questions": [{
    "id": "sustenta",
    "type": "noul",
    "instructions": "A `mensagem` responde ou sustenta diretamente a `pergunta`? Considere o assunto, não as palavras exatas.",
    "criteria": {
      "true": "A mensagem trata do que a pergunta pede e serviria de fonte para respondê-la.",
      "false": "A mensagem é de outro assunto, só parecido, ou não dá base para responder."
    }
  }]
}
```

- O formato exato (`type`, `criteria`, nomes dos campos) segue a referência da API na data da ação. O texto acima fixa o significado da pergunta, não a sintaxe.
- **Concorrência:** 10 requisições simultâneas, com o `AbortSignal` do prazo total.
- **Erros:** 429 e 529 viram "sem resposta" para a candidata, sem nova tentativa dentro da pergunta. 401 e 400 geram um log sem conteúdo e o modo degradado.
- **Custo:** cobrança por token de entrada, com a saída grátis. Uma pergunta com 30 candidatas fica na ordem de dezenas de milhares de tokens.

## 3. Configuração

| Variável | Valor | Regra |
|----------|-------|-------|
| `PALANTIR_VERIFIER` | `off` (padrão), `typesafe`, `fake` | `fake` só em testes |
| `PALANTIR_VERIFIER_ALLOW_REMOTE` | `true` | Obrigatória para `typesafe`; sem ela, a configuração recusa a subida |
| `TYPESAFE_API_KEY` | chave | Só no `.env`, nunca no repositório |
| `PALANTIR_VERIFIER_MODEL` | `jev-1.14.0` | Versão fixa, não o alias `jev-latest` |
| `PALANTIR_VERIFIER_MIN_PROBABILITY` | `0.7` | Recalibrado pelo eval |

Na subida, com o verificador ligado, o log avisa (sem conteúdo): "verificador externo ligado: perguntas e trechos candidatos saem desta máquina".

## 4. Privacidade

- O que sai da máquina, por pergunta (ADR-0013): o texto da pergunta e, de cada candidata, o trecho e o apelido do autor ("pessoa 1", "pessoa 2", refeito a cada pergunta). Um nome na pergunta que coincida com o de um autor das candidatas vai trocado pelo mesmo apelido.
- O que nunca sai: o nome do autor, o título da conversa, a data, os ids internos (o `id` da candidata fica do nosso lado e não vai no `state`) e outras mensagens. Nomes e números escritos dentro do próprio trecho vão com ele.
- Nada disso vai para log ou métrica. As métricas só contam:
  - `verifier_calls_total{outcome}`, uma por pergunta: `cited` (aprovou alguma candidata), `nothing_found` (recusou todas, e a resposta vira "não encontrei") ou `failed` (não respondeu, e a busca volta aos sinais);
  - `verifier_candidates_total{outcome}`, por candidata enviada: `approved` (p ≥ mínimo), `rejected` ou `unanswered` (sem resposta, como em 429 e 529).
- Segundo a documentação da TypeSafe, eles não treinam modelos com os dados dos clientes, e a retenção zero existe para clientes enterprise sob pedido. A documentação não fala de LGPD nem de região. O ADR-0013 leu o DPA e a política de privacidade (EUA, retenção sem prazo, SOC 2 Type II) e libera o uso só para testes do dono.

## 5. Adaptador `fake` (testes)

Devolve p = 0,9 para as candidatas cujo trecho contém um marcador de fixture e p = 0,1 para as outras. Com ele, os testes cobrem a ordenação, o "não encontrei", o prazo e o modo degradado sem rede.

> Execução (2026-11-25):
> - Uma requisição por pergunta, com as candidatas em `state.mensagens` e uma pergunta "noul" `c0..cN` para cada uma, conforme a recomendação da TypeSafe de juntar perguntas independentes sobre o mesmo estado.
> - A chamada é com `fetch`, sem SDK.
> - A resposta é lida em `answers.cN.noul`.
> - ADR-0013 (2026-11-25): `state.mensagens[i]` leva só `autor` (apelido) e `texto`; a instrução da noul pede que, em pergunta sobre o que uma pessoa disse, a mensagem seja dessa pessoa.
> - Demonstração (2026-11-25): com o mínimo de 0,7, o Jev recusou as 30 candidatas de uma pergunta real cuja resposta estava em 5º lugar na fusão (nota 0,51; a mensagem era o título de uma lista mandada como imagem). O `.env` do dono passou a `PALANTIR_VERIFIER_MIN_PROBABILITY=0.5`, de forma provisória; o padrão do código continua 0,7. Calibrar com perguntas reais, ou fazer o verificador só reordenar quando os sinais já têm evidência forte (muda a D-10), fica para uma decisão futura.
