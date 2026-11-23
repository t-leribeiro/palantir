# Interface: comando `npm run whatsapp:grupos`

> Feature: `004-captura-ao-vivo-grupo-teste` (RF-02, RF-03, RF-08; D-06, D-07, D-08)
> Script: `node --env-file-if-exists=.env --import tsx src/main/whatsapp-groups.ts`

O comando lê e grava só no banco e nunca conecta ao WhatsApp. A lista de grupos vem do diretório que o processo `npm run dev:whatsapp` mantém.

## `listar` (padrão)

```
npm run whatsapp:grupos
npm run whatsapp:grupos -- listar [--dono <provider:conta>]
```

Saída, por exemplo:

```
Grupos do número de captura (atualizado em 23/11/2026 17:40):
  1. Grupo de teste Palantír   5 participantes   autorizado (fonte "T3", desde 23/11 17:42)
  2. Família                  12 participantes   não autorizado
  3. Comunidade DevOps        80 participantes   revogado em 23/11 18:10
Para autorizar: npm run whatsapp:grupos -- autorizar <número> --consentimento "<texto>" [--conversa "<nome>"]
```

- A ordem é estável: por nome do grupo e, em empate, pelo id. O número de cada linha é o índice dessa ordem.
- Grupos marcados com `left_at` aparecem como "o número saiu do grupo".
- Se o diretório estiver vazio, o comando sai com código 0 e a mensagem: "Nenhum grupo conhecido. Ligue a captura e rode `npm run dev:whatsapp` para atualizar a lista."
- O comando não mostra o id do grupo nem pessoas; o nome do grupo aparece porque o próprio operador precisa reconhecê-lo.

## `autorizar`

```
npm run whatsapp:grupos -- autorizar <grupo> --consentimento "<texto>" [--conversa "<nome>"] [--dono <provider:conta>]
```

| Parâmetro | Obrigatório | Regra |
|-----------|-------------|-------|
| `<grupo>` | sim | Número da listagem atual ou id do grupo (`...@g.us` ou só os dígitos) |
| `--consentimento` | sim | 10 a 500 caracteres; guardado em `source_captures.consent_statement` |
| `--conversa` | não | Nome de uma conversa já importada pelo mesmo dono; as mensagens caem na fonte `export:<nome>` |
| `--dono` | não | Padrão `fake:fake-operator`, igual a `import` e `whatsapp:link` |

Saídas (código 0):
- `Grupo "Grupo de teste Palantír" autorizado para captura (fonte "T3"). Mensagens novas a partir de agora.`
- `Grupo "..." autorizado para captura (fonte nova "Grupo de teste Palantír"). ...`

Erros (código 1, mensagem em português, sem rastreio de pilha):

| Caso | Mensagem |
|------|----------|
| Sem `--consentimento` ou fora do tamanho | "Informe --consentimento com 10 a 500 caracteres: como os participantes foram avisados e consentiram." |
| Grupo não encontrado no diretório | "Grupo não encontrado. Rode `npm run whatsapp:grupos` para ver a lista atual." |
| Grupo já autorizado | "O grupo já está autorizado desde <data>. Para trocar a fonte, revogue e autorize de novo." |
| `--conversa` inexistente para o dono | "Não há conversa importada com o nome "<nome>" para este dono." |
| Dono inexistente | mesma mensagem do `import` |

O comando é idempotente: repetir uma autorização que já está ativa cai no erro "já autorizado" e não cria uma segunda linha.

## `revogar`

```
npm run whatsapp:grupos -- revogar <grupo>
```

- Marca `revoked_at` na captura ativa. A próxima mensagem do grupo já é descartada (motivo `not_authorized`).
- Saída: `Captura do grupo "..." revogada. As mensagens já guardadas continuam pesquisáveis (exclusão na S5).`
- Grupo sem captura ativa: código 1, "O grupo não está autorizado.".

## Privacidade

O comando nunca imprime texto de mensagens, números de telefone nem a declaração de consentimento de outras autorizações; a declaração só aparece no eco da própria autorização.
