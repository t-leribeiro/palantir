# Interface: comando "mostra a N" e as respostas

> Feature: `008-mostrar-original-com-contexto` · Decisões D-01 a D-06, D-11, D-13

## 1. Reconhecimento

- Texto normalizado com `normalizeText` (sem acento, minúsculas, sem pontuação, espaços colapsados).
- Expressão: `^(?:mostra|mostrar|ver|original)(?: a)? ([1-9])$`.
- Casam: "Mostra a 2", "mostrar 2", "ver a 1", "original 3", "mostra a 2!".
- Não casam: "me mostra o que a Ana disse", "mostra tudo", "ver 10".
- **Ordem em `answerActive`:**
  1. conta pendente;
  2. confirmação pendente e comandos de gestão (S5);
  3. **"mostra a N"**;
  4. ajuda;
  5. pergunta.
- Só na conversa direta com o agente. Mensagem de grupo nunca chega aqui (S3).

## 2. Estado das citações

- Grava a cada resposta `outcome = "answered"`, com as `citations` do `AgentReply` (índice, `messageId`, `kind`, `audioStartS`, `audioEndS`).
- Vale 2 h a partir da resposta.
- Ordem de leitura: lista ausente ou vencida dá `no_recent`; N maior que a quantidade de citações dá `out_of_range`; senão, busca por contexto do `messageId` da citação N.

## 3. Textos (pt-BR, neutros, sem formatação de canal)

| Resultado | Texto |
|-----------|-------|
| `no_recent` | "Não tenho citações recentes para mostrar. Faça a pergunta de novo e depois mande \"mostra a\" com o número da citação." |
| `out_of_range` | "A última resposta tem só {n} citação(ões). Mande \"mostra a 1\"{ até \"mostra a n\"}." |
| `deleted` | "Essa conversa foi apagada, então não consigo mostrar a mensagem." |
| `not_found` | "Não encontrei mais essa mensagem." |
| `shown`, texto | Ver o formato em §4 |
| `shown`, áudio | Ver o formato em §5 |
| Arquivo não guardado | Linha final: "O arquivo deste áudio não está guardado, então mando só a transcrição." |
| Acima de 16 MB | Linha final: "O arquivo deste áudio é grande demais para mandar pelo WhatsApp." |
| `failureText` do anexo | "Não consegui mandar o arquivo do áudio agora. Tente \"mostra a {N}\" de novo daqui a pouco." |

## 4. Formato: mensagem de texto

```
[2] Ana em T3, 12/11/2026 às 14:32:

<texto inteiro da mensagem, com a legenda se houver>

Conversa em volta:
14:28 Bruno: <até 280 caracteres>
14:30 Carla: [áudio de 0:42] <até 280 caracteres da transcrição>
» 14:32 Ana: <até 280 caracteres>
14:35 Bruno: <até 280 caracteres>
```

- Horas no fuso `America/Sao_Paulo`. Vizinha de outro dia ganha a data ("11/11 18:02").
- Sem vizinhas (conversa de uma mensagem só), a seção "Conversa em volta" não aparece.

## 5. Formato: áudio

```
[1] Ana em T3, 12/11/2026 às 14:32, áudio de 1:42:

0:00 <segmento>
0:12 <segmento>
» 0:37 <segmento citado>
» 0:45 <segmento citado>
1:02 <segmento>

Conversa em volta:
...

Mando o áudio em seguida.
```

- Os segmentos marcados com "»" são os que se sobrepõem a `[audioStartS, audioEndS]` da citação.
- Transcrição acima de 6.000 caracteres: janela de segmentos em volta dos citados até 6.000, com "(…)" no começo e/ou no fim.
- **Transcrição pendente ou com falha:** "A transcrição deste áudio ainda não está pronta." ou "Não consegui transcrever este áudio." No lugar dos segmentos, e o arquivo vai do mesmo jeito se estiver guardado.
- `AgentReply`: `outcome = "answered"`, `citations = [a citação mostrada, com o mesmo índice]`, `media = [{ kind: "audio", ref, mimeType, durationSeconds, sizeBytes, failureText }]` quando o arquivo está guardado e tem até 16 MB.

## 6. Ajuda

Nova linha na ajuda, logo depois dos exemplos de pergunta: `• Depois de uma resposta: "mostra a 2" abre a citação 2 inteira`.

## 7. Métrica e trace

- `agent_show_source_total{outcome}`, com `shown`, `no_recent`, `out_of_range`, `deleted` e `not_found`.
- Span `agent.show_source`, sem atributos de conteúdo. O resultado e o tipo ficam na métrica.

> Execução (2026-11-25):
> - A ajuda tem limite de 600 caracteres desde a S2; o comando entrou como uma linha só, com o exemplo.
> - O texto da mensagem citada é limitado a 12.000 caracteres, com "…", para caber nos 20.000 do `AgentReply.text`.
> - O texto para arquivo grande diz "grande demais para mandar por aqui", sem nomear o canal (o núcleo não conhece o WhatsApp).
> - Citações vencidas e áudio sem arquivo guardado são testados no serviço e no compositor: um áudio sem arquivo nunca é transcrito, então não vira citação pela busca.
