# Interface: comandos de guardar, listar e esquecer (conversa com o agente)

> Feature: `009-guardar-por-tema` · Decisões D-04, D-06, D-07, D-12 a D-15, D-19

Os comandos são palavras fixas, sem LLM, só para conta ativa e verificada, em conversa direta com o agente. Uma mensagem encaminhada nunca é comando.

## 1. Ordem de roteamento (D-04)

1. Conta desconhecida: silêncio, como hoje. Conta pendente: só o código, como hoje.
2. Mensagem encaminhada, ou mídia mandada direto (áudio, foto, vídeo, documento, figurinha): **espera**, ver §3.
3. Texto do dono, nesta ordem:
   1. resposta de tema, se houver conteúdo aguardando tema (D-14);
   2. **guardar** (§2);
   3. comandos da S5 (`grupos`, `mais`, `acompanhar`, `parar`, `apagar`, `confirmo`, `confirmo apagar`);
   4. **listar e esquecer** (§4, §5);
   5. "mostra a N" (S7);
   6. ajuda;
   7. pergunta (busca).

## 2. Guardar

Reconhecimento sobre o texto cru, sem diferenciar maiúsculas nem acentos:

| Texto | Efeito |
|-------|--------|
| `guarda isso em <tema>`, `guarda em <tema>`, `guardar em <tema>` | Sem citação, guarda tudo o que espera. Com citação de um encaminhado, guarda só ele |
| `guarda em <tema>: <conteúdo>` | Guarda o `<conteúdo>`, que é o texto depois do primeiro `:`. A espera não muda |
| `guarda isso`, `guarda`, `guardar` | Pede o tema (D-14) |

- `<tema>` tem de 1 a 60 caracteres, depois de tirar os espaços das pontas. Mais que isso, o agente responde "O tema pode ter até 60 caracteres."
- O nome mostrado é o da primeira vez que o tema foi usado.

| Situação | Resposta (texto exato a fixar nos testes) |
|----------|-------------------------------------------|
| Guardou N itens | `Guardei em <tema>.` (1) ou `Guardei 3 itens em <tema>.` |
| Parte já estava | `Guardei 2 itens em <tema>; 1 já estava guardado.` |
| Tudo já estava | `Isso já estava guardado em <tema>.` |
| Nada esperando, sem texto | `Não há nada para guardar. Encaminhe a mensagem e depois mande "guarda em <tema>".` |
| Citação de algo que não espera mais | `Não achei essa mensagem encaminhada. Encaminhe de novo e mande "guarda em <tema>".` |
| Foto, vídeo ou documento sem legenda | `Dessa <foto/vídeo/documento> eu só guardo a legenda, e ela não tem.` (contado à parte quando vier junto de outros) |
| Figurinha ou tipo não aceito | `Esse tipo de mensagem eu não guardo.` |
| Áudio sem armazenamento de mídia | `Não consigo guardar áudio agora: o armazenamento de mídia não está ligado.` |
| Pedido de tema | `Em qual tema eu guardo? Responda só o nome, por exemplo "arquitetura".` |
| Leva acima de 20 | `Guardei 20 itens em <tema>; os outros N passaram do limite de 20 por vez.` |
| Falha | `Não consegui guardar agora. Tente "guarda em <tema>" de novo daqui a pouco.` (o que esperava continua esperando) |
| Aviso de "sem tema" (na próxima resposta) | `Guardei em "sem tema" o que você encaminhou sem dizer o tema.` antes da resposta |

## 3. Espera (D-05)

- Ela vale por dono e canal: até 20 mensagens, cada uma por 10 min a partir da chegada.
- O primeiro encaminhado com a espera vazia recebe `Recebi. Para guardar, mande "guarda em <tema>".`. Os seguintes não recebem nada.
- O que vence sem pedido é descartado, e fica só a contagem `agent_forwarded_total{outcome="discarded"}`.

## 4. Listar

| Texto | Efeito |
|-------|--------|
| `guardados <tema>`, `o que guardei sobre <tema>`, `o que guardei em <tema>`, `o que eu guardei sobre <tema>` (com ou sem `?`) | Lista o tema |
| `temas`, `meus temas`, `guardados` | Lista os temas |

Listagem do tema, como `AgentReply` com `outcome: "answered"` e uma citação por item (autor "Você", título `Guardados · <tema>`):

```
Guardados em arquitetura (3):
1. 25/11/2026 14:02: “o Temporal resolveu os workflows longos…” [1]
2. 24/11/2026 09:15: áudio de 1:42: “a gente decidiu…” [2]
3. 20/11/2026 18:40: “https://exemplo.com/filas artigo sobre filas” [3]

"mostra a 2" abre o item inteiro; "esquece a 2" apaga.
```

- Mostra até 9 itens. Com mais, a última linha diz `Mostrando os 9 mais recentes de 14.`
- Um áudio ainda sem transcrição aparece como `áudio de 1:42 (transcrição pendente)`.
- Tema sem itens: `Você ainda não guardou nada sobre <tema>.`. Se houver temas, o agente sugere `Seus temas: arquitetura, leituras.`, com até 5.

Listagem dos temas: `Seus temas: arquitetura (3), leituras (1), sem tema (2).`, com até 20, do mais recente ao mais antigo. Sem nenhum tema: `Você ainda não guardou nada. Encaminhe uma mensagem e mande "guarda em <tema>".`

## 5. Esquecer

| Texto | Efeito |
|-------|--------|
| `esquece a N`, `esquecer N`, `esquece N`, com N de 1 a 9 | A citação N da última resposta com citações (S7) |

| Situação | Resposta |
|----------|----------|
| É um guardado | `Apago "<primeiros 60 caracteres>" de <tema>? Responda "confirmo".` A ação pendente `forget` vale 5 min |
| `confirmo` no prazo | `Apaguei de <tema>.` A exclusão está no data-delta §5 |
| Não é um guardado | `Só dá para esquecer um item guardado. Para tirar uma conversa, use "apagar <nome>".` |
| Sem citações recentes ou N fora | As mesmas respostas do "mostra a N" (S7) |

## 6. "mostra a N" de um guardado

- Cabeçalho `Guardado em <tema> em 25/11/2026 14:02`.
- Depois o texto inteiro ou, para áudio, a transcrição e o arquivo, como na S7.
- Sem "Conversa em volta" (D-11).

## 7. Grupos (D-15)

- `grupos` mostra `Guardados (N itens)` como último item.
- `apagar Guardados` segue a S5: pede `confirmo apagar Guardados` e depois avisa quantos itens apagou.
- `acompanhar` e `parar` sobre ele respondem `Guardados não é um grupo: é onde ficam os itens que você guarda.`
