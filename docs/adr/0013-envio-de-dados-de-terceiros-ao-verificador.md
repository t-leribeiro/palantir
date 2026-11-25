# ADR-0013: Envio de dados de terceiros ao verificador externo (Jev, TypeSafe)

- Status: aceito
- Data: 2026-11-25
- Decisores: Leandro (produto)
- Origem: ADR-0012, item 8 e "Quando revisar"; `_reversa_forward/007-achar-assunto-outras-palavras/interfaces/verificador-externo.md`

## Contexto

O ADR-0012 criou o verificador externo opcional: o Jev, da TypeSafe, julga se cada mensagem candidata responde à pergunta. Ele fica desligado por padrão. O mesmo ADR exige uma decisão própria antes de ligá-lo com dados reais, porque as mensagens são de terceiros: participantes de grupos e contatos que não usam o Palantír.

**O que sai da máquina hoje, por pergunta, com o verificador ligado:**
- uma requisição `POST https://api.typesafe.ai/v1/systemone`, com a chave `TYPESAFE_API_KEY`;
- o texto da pergunta;
- até 30 mensagens candidatas, cada uma com quatro campos:
  - o texto do trecho;
  - o nome do autor, como aparece no WhatsApp: pode ser o nome salvo ou o número;
  - o nome da conversa ou do grupo;
  - a data e a hora.

O texto pode conter qualquer coisa dita no grupo: nomes, números de telefone, documentos, valores e até senhas coladas por engano.

**O que não sai:**
- os identificadores internos (mensagem, espaço, fonte);
- os áudios, pois só vai a transcrição, quando o trecho for de áudio;
- os vetores;
- mensagens que não estão entre as candidatas daquela pergunta.

**O que a TypeSafe declara** (lido em 2026-11-25):

| Ponto | O que dizem | Fonte |
|---|---|---|
| Treino | Não treina modelos com a entrada sem consentimento prévio do cliente | Política de privacidade; Master Customer Agreement (MCA) §4.1 |
| Telemetria | Pode processar sem restrição, e para sempre, a telemetria derivada do uso: logs técnicos, hashes, estatísticas, classificações e "aprendizados" | MCA §4.1 e §4.3 |
| Armazenamento | A entrada das requisições é armazenada e processada na AWS. A Modal, a Nebius e a CoreWeave processam sem armazenar | trust.typesafe.ai/subprocessors |
| Prazo de retenção | Não informado. O texto só diz "pelo tempo necessário" | Política de privacidade; DPA, Schedule I, item 8 |
| Retenção zero (ZDR) | Só para clientes enterprise, sob pedido | docs.typesafe.ai/legal |
| Região | Estados Unidos. Alguns subprocessadores são "Worldwide": Cloudflare, Azure e GCP | Política de privacidade; página de subprocessadores |
| Contrato | Existe um DPA, com notificação de incidente em 72 h, auditoria anual, aviso de novo subprocessador e cláusulas-padrão da UE. Ele não menciona a LGPD | typesafe.ai/legal/data-processing |
| Certificação | SOC 2 Type II (2026), com o relatório disponível sob pedido | trust.typesafe.ai |

Para a LGPD, enviar a uma empresa nos EUA é transferência internacional (art. 33). A base legal adotada no ADR-0011 é o consentimento declarado por grupo. Esse consentimento foi pensado para acompanhar e pesquisar localmente, não para enviar a um fornecedor no exterior.

## Decisão

1. **Minimização antes de ligar.** O verificador passa a enviar a pergunta e, por candidata, só o texto do trecho e um apelido do autor.
   - Nome da conversa e data saem do corpo:
     - pergunta por grupo já é filtrada localmente (S5);
     - pergunta por período fica para o filtro local de período (spec `retrieval`).
   - O autor não vai com o nome, mas também não sai do julgamento: em "o que a Fulana disse sobre X?", a autoria faz parte da pergunta. Cada autor distinto entre as candidatas vira "pessoa 1", "pessoa 2", e assim por diante, consistente dentro de uma requisição e refeito a cada pergunta.
   - Um nome na pergunta que coincida com o de um autor das candidatas troca para o mesmo apelido. A comparação ignora acento e maiúsculas, e vale o nome inteiro ou o primeiro nome. Por exemplo, "o que a pessoa 2 disse sobre o SLA?".
   - Em "quem disse X?", o Jev só julga se a mensagem diz X. O nome do autor chega à resposta pela citação local, que nunca passa pelo Jev.
   - A mudança fica em `systemOneBody` (`src/modules/retrieval/infrastructure/verifiers/typesafe.ts`). Os testes garantem que nenhum nome de autor, título de conversa ou data vai no corpo, e que o apelido da pergunta bate com o da candidata.
2. **Ligar continua sendo um ato explícito, com as duas variáveis.**
   - `PALANTIR_VERIFIER=typesafe` e `PALANTIR_VERIFIER_ALLOW_REMOTE=true` precisam estar ligadas juntas.
   - O padrão continua `off`.
   - A subida registra em log o aviso de que perguntas e trechos saem da máquina.
3. **Uso liberado: testes do próprio dono.**
   - O dono pode ligar o verificador para medir e demonstrar com as conversas que já importou ou acompanha, ciente de que os trechos candidatos vão para a TypeSafe nos EUA, sem prazo de retenção definido.
   - Não pode ficar ligado de forma permanente nem em grupos de outras pessoas.
   - O uso contínuo depende das condições em "Quando revisar".
4. **Sem chave em log nem em repositório.**
   - A `TYPESAFE_API_KEY` fica só no `.env`, que o setup preserva e o git ignora.
   - Nem a requisição nem a resposta vão para log; as métricas só contam.
5. **Desligar é imediato e não deixa resto local.**
   - Basta voltar `PALANTIR_VERIFIER=off`.
   - A busca não guarda nada do verificador: só a decisão daquela resposta.
   - O que já foi enviado fica sob a retenção da TypeSafe.

## Consequências

- **Positivas:**
  - o Jev pode ser medido com perguntas reais, onde a busca por sinais erra;
  - com a minimização, não saem nomes de autores, nomes de grupos nem datas, a não ser que estejam no próprio texto;
  - perguntas sobre o que uma pessoa disse continuam sendo julgadas pela autoria, pelos apelidos.
- **Negativas e riscos:**
  - o texto dos trechos continua saindo e pode conter dados pessoais de terceiros;
  - quando a pergunta cita alguém por apelido ("Lê" para Leandro), o nome não coincide com nenhum autor e vai como foi escrito;
  - a retenção na TypeSafe não tem prazo, e a telemetria derivada pode ser usada para sempre;
  - os participantes dos grupos não foram informados desse envio; o consentimento do ADR-0011 não o cobre;
  - cada pergunta depende da rede e de um fornecedor; fora do ar, a busca volta à decisão por sinais e marca `degraded`.

## Alternativas consideradas

- **Enviar a candidata inteira (autor, conversa, data e texto), como está hoje:** expõe nomes de terceiros e de grupos. A autoria, o único campo que o julgamento usa, chega igual pelos apelidos.
- **Tirar o autor do corpo:** em "o que a Fulana disse sobre X?", o Jev aprovaria mensagens de outra pessoa sobre o assunto, e a resposta citaria a pessoa errada.
- **Mascarar nomes e números dentro do texto antes de enviar:** reduz mais, mas o reconhecimento de nomes em português informal é frágil. Fica para quando o uso contínuo for considerado.
- **Só com retenção zero (ZDR enterprise):** a opção mais segura para uso contínuo, mas depende de contrato com a TypeSafe. Fica como condição para o uso contínuo.
- **Um verificador local:** não há modelo equivalente rodando em CPU nesta máquina hoje. A reordenação local (`retrieval` OQ-02) segue como caminho se o Recall@10 ficar abaixo de 90%.

## Quando revisar

- Antes de deixar o verificador ligado de forma contínua. Pré-condições:
  - retenção zero contratada, ou um prazo de retenção por escrito;
  - o consentimento declarado nos grupos (ADR-0011) passando a mencionar o envio a um fornecedor no exterior.
- Se a TypeSafe mudar o DPA, a política de privacidade ou os subprocessadores. O DPA dá 15 dias para objeção.
- Quando a busca ganhar o filtro local por autor, previsto na spec `retrieval`, como o filtro por grupo da S5: aí o autor deixa de ir ao Jev, até como apelido, e ele volta a julgar só o assunto.
- Antes de usar com grupos de outras pessoas (memória coletiva, fora da v0.1).
