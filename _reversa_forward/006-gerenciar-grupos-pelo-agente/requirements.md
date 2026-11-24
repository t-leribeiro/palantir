# Requirements: Gerenciar grupos conversando com o agente (fatia S5)

> Identificador: `006-gerenciar-grupos-pelo-agente`
> Data: `2026-11-24`
> Pasta da extração reversa: `_reversa_sdd/` (greenfield: `prd.md`, specs em `sdd/` e adendos 001 a 005, mais os de bug)
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

O usuário passa a cuidar dos seus grupos conversando com o agente pelo WhatsApp, sem terminal. Ele pede a lista de grupos e conversas, começa a acompanhar um grupo (com a confirmação de que os participantes sabem e concordam), para de acompanhar e apaga um grupo com tudo o que veio dele. A conta que dá essas ordens precisa ter provado que é dona do número. As perguntas também passam a aceitar o nome do grupo, como em "em qual áudio do T3...", para buscar só nele.

Hoje só o operador autoriza e revoga grupos, por comando no terminal (S3). O vínculo do número pessoal é um ato do operador, sem verificação (S2). Nada apaga uma fonte: o histórico de um grupo revogado continua pesquisável para sempre. Esta fatia fecha o ciclo de opt-in, revogação, exclusão e auditoria que o PRD exige desde o MVP.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/prd.md#4. Escopo (in)` | Segurança e privacidade desde o MVP: opt-in por conversa, isolamento antes da busca, exclusão de fonte com dados derivados, retenção configurável | 🟡 |
| `_reversa_sdd/prd.md#8. Riscos` | Exposição de dados de terceiros dos grupos (LGPD): impacto alto; mitigação por opt-in, isolamento, exclusão e retenção; enquadramento LGPD pendente | 🟡 |
| `_reversa_sdd/sdd/identity-and-sources.md#6. Requisitos Funcionais` | RF-03 verificação de posse por código de uso único (10 min); RF-05 autorizar e revogar; RF-07 exclusão em cascata (mensagens, anexos, transcrições, embeddings, objetos de mídia); RF-08 retenção; RF-10 auditoria | 🟡 |
| `_reversa_sdd/sdd/identity-and-sources.md#6.3 Fluxos Alternativos` | Exclusão: confirmação explícita, fonte `deleting`, mensagens novas rejeitadas, aviso com a quantidade apagada. Revogação: para a captura e mantém o histórico | 🟡 |
| `_reversa_sdd/sdd/identity-and-sources.md#7. Requisitos Não-Funcionais` | RNF-02 código com hash, uso único, 10 min, até 5 tentativas; RNF-03 exclusão em cascata em até 5 min, inclusive mídia | 🟡 |
| `_reversa_sdd/sdd/identity-and-sources.md#11. Edge Cases e Tratamento de Erros` | EC-01 conta de outro usuário; EC-02 código errado 5 vezes; EC-03 falha do storage na exclusão (retentativas por até 24 h, depois alerta); EC-04 mensagem para fonte `deleting` ou `revoked` | 🟡 |
| `_reversa_sdd/sdd/identity-and-sources.md#14. Open Questions` | OQ-01 base legal (LGPD) antes de uso fora do ambiente de teste; OQ-02 revogar só para a captura (adotado) | 🟡 |
| `_reversa_sdd/sdd/conversational-agent.md#6. Requisitos Funcionais` | RF-01 identidade antes de qualquer ferramenta; RF-02 intenção `manage_sources` | 🟡 |
| `_reversa_sdd/sdd/conversational-agent.md#11. Edge Cases e Tratamento de Erros` | EC-04 "apaga o grupo X" pede confirmação explícita; EC-06 nomes parecidos: perguntar qual, listando as opções | 🟡 |
| `_reversa_sdd/sdd/conversational-agent.md#12. Segurança e Privacidade` | `space_id` sempre derivado da identidade, nunca do texto; operações destrutivas exigem confirmação | 🟡 |
| `_reversa_sdd/addenda/001-walking-skeleton.md#Impacto por artefato da extração` | Verificação por código, autorizar/revogar/excluir pelo agente, retenção e auditoria seguem pendentes; a cascata de exclusão já é garantida pelo banco | 🟢 |
| `_reversa_sdd/addenda/003-perguntar-pelo-whatsapp.md#Impacto por artefato da extração` | `whatsapp:link` ativa o número pessoal por ato do operador; a verificação por código (RF-03) foi adiada para a S5; remetente desconhecido recebe silêncio no WhatsApp; só a intenção `help`, por palavras fixas | 🟢 |
| `_reversa_sdd/addenda/004-captura-ao-vivo-grupo-teste.md#Impacto por artefato da extração` | `npm run whatsapp:grupos` lista, autoriza (consentimento declarado de 10 a 500 caracteres, `--conversa` liga à importação) e revoga; `source_captures` audita a autorização; `whatsapp_groups` é o diretório de grupos; revogar mantém o histórico | 🟢 |
| `_reversa_sdd/addenda/005-perguntar-sobre-audios.md#Impacto por artefato da extração` | Áudios guardados cifrados no SeaweedFS com chave `space/source/sha256`; transcrições, segmentos e trechos com faixa de áudio; job `media.process` | 🟢 |
| `docs/plano-de-fatias.md#Status` | S5: listar, autorizar, parar de acompanhar e apagar grupos conversando com o agente, com verificação da conta; pendência: base legal na LGPD antes de sair dos grupos de teste | 🟢 |

Estado medido em 2026-11-24, sem ler conteúdo:
- **Número do agente:** um chip antigo do usuário que participa de cerca de 55 grupos. No modo `agent`, ele também captura.
- **Conta do usuário:** o número pessoal está `active`, vinculado pelo operador na S2, sem verificação por código.
- **Fontes atuais:** um grupo capturado ao vivo (Contas da Casa) e as conversas importadas (T3 e outras duas).

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| P1, Profissional conectado (`_reversa_sdd/personas.md#Persona 1`) | Escolher pelo celular quais grupos viram memória | Manda "grupos" ao agente, vê os grupos numerados e responde "acompanhar 4". Confirma que o grupo sabe e concorda, e as mensagens novas passam a entrar |
| P1, ao sair de um projeto | Parar de guardar um grupo, ou apagar tudo dele | Manda "parar T3": as mensagens novas deixam de entrar. Semanas depois, manda "apagar T3", confirma, e recebe o aviso de que as mensagens e os áudios foram apagados |
| P2, Gestor/consultor (`_reversa_sdd/personas.md#Persona 2`) | Atender um cliente que pediu para não ter o grupo guardado | Apaga o grupo do cliente pelo celular e tem o registro de quando a exclusão foi pedida e concluída |
| Operador (hoje, o próprio usuário) | Vincular um número com segurança e auditar o que foi feito | Vincula o número pessoal, que só fica ativo depois da prova de posse, e consulta a auditoria das autorizações e exclusões |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** Só uma conta verificada e ativa dá ordens de gestão, e só em conversa direta com o agente. Mensagem em grupo nunca é lida como comando. O espaço afetado vem sempre da identidade do remetente, nunca do texto. 🟢
   - Origem: `_reversa_sdd/sdd/conversational-agent.md#12. Segurança e Privacidade`, `_reversa_sdd/sdd/identity-and-sources.md#12. Segurança e Privacidade`
   - Tipo: nova (a gestão sai do terminal e passa a ter remetente)
2. **RN-02:** Uma conta fica `pending` até provar a posse do número. O código circula assim:
   - o `npm run whatsapp:link` mostra no terminal um código de uso único, válido por 10 min e guardado só como hash;
   - o dono manda esse código do próprio WhatsApp ao agente, em conversa direta;
   - o código certo ativa a conta. 5 tentativas erradas invalidam o código, e é preciso pedir outro.

   Assim, quem está no terminal prova que controla o número, e o agente não manda mensagem espontânea. Na subida da S5, toda conta ativa sem verificação volta para `pending`, inclusive a conta pessoal vinculada na S2, e precisa mandar um código novo. Uma conta `pending` não pergunta nem gerencia: ela recebe só a instrução de verificação. 🟢
   - Origem: `_reversa_sdd/sdd/identity-and-sources.md#6. Requisitos Funcionais` (RF-03) e `#7` (RNF-02); `_reversa_sdd/addenda/003-perguntar-pelo-whatsapp.md` (RF-03 adiado para a S5); esclarecimento de 2026-11-24
   - Tipo: alterada (o vínculo deixa de ser só um ato do operador)
3. **RN-03:** A lista mostra as conversas do espaço do usuário, numeradas:
   - os grupos de que o número de captura participa, com o estado: não acompanhado, acompanhando ou parado;
   - as conversas importadas.

   O número de cada item vale só para a última lista mostrada àquele usuário, por até 30 min. Depois disso, um comando por número pede uma lista nova. Um comando por nome aceita o nome exato, ou um trecho que identifique uma única conversa. Se o nome servir para mais de uma, o agente lista as opções e não age. 🟡
   - Origem: `_reversa_sdd/sdd/conversational-agent.md#11. Edge Cases e Tratamento de Erros` (EC-06); `_reversa_sdd/addenda/004-captura-ao-vivo-grupo-teste.md` (um grupo de nome parecido foi autorizado por engano na demo da S3)
   - Tipo: nova
4. **RN-04:** Acompanhar um grupo exige dois passos. O agente pede a confirmação, citando o nome do grupo e a declaração de que os participantes foram informados e concordam. O usuário confirma em até 5 min. A autorização registra quem, quando e a declaração confirmada, como na S3. Se houver uma conversa importada com o mesmo nome, o agente avisa que o histórico importado será ligado ao grupo. 🟡
   - Origem: `_reversa_sdd/addenda/004-captura-ao-vivo-grupo-teste.md` (RN-02 e RN-05 da S3: consentimento declarado e ligação com a importação)
   - Tipo: alterada (o consentimento passa a ser confirmado pelo dono no celular, não só digitado pelo operador)
5. **RN-05:** Parar de acompanhar tem efeito imediato e não pede confirmação. As mensagens novas deixam de entrar, e o histórico continua pesquisável até ser apagado. Voltar a acompanhar exige uma nova confirmação de consentimento. 🟢
   - Origem: `_reversa_sdd/sdd/identity-and-sources.md#14. Open Questions` (OQ-02 adotada); `_reversa_sdd/addenda/004-captura-ao-vivo-grupo-teste.md` (RN-06 da S3)
   - Tipo: alterada (antes, só pelo terminal)
6. **RN-06:** Apagar é irreversível e exige confirmação explícita com o nome da conversa (ex.: "confirmo apagar T3"), em até 5 min. Confirmado o pedido:
   - a fonte vira `deleting` e some das respostas na hora;
   - a captura para, e nenhuma mensagem nova da fonte é aceita, ao vivo ou por importação;
   - a exclusão em cascata apaga mensagens, trechos indexados, anexos, transcrições, segmentos, arquivos de mídia e jobs pendentes da fonte;
   - ao terminar, o agente avisa o usuário com as quantidades apagadas.

   Depois disso, o grupo pode voltar a ser acompanhado e a conversa pode ser importada de novo, como fonte nova. 🟡
   - Origem: `_reversa_sdd/sdd/identity-and-sources.md#6.3 Fluxos Alternativos` (Fluxo A) e `#6. Requisitos Funcionais` (RF-07); `_reversa_sdd/sdd/conversational-agent.md#11` (EC-04)
   - Tipo: nova
7. **RN-07:** Vincular, verificar, acompanhar, parar e apagar (pedido e conclusão) geram um evento de auditoria com usuário, ação, alvo, momento e, na exclusão, as quantidades. O evento nunca tem conteúdo de mensagem. 🟡
   - Origem: `_reversa_sdd/sdd/identity-and-sources.md#6. Requisitos Funcionais` (RF-10) e `#12` (auditoria sem conteúdo)
   - Tipo: nova (a S3 auditava só a autorização de captura)
8. **RN-08:** Nenhum número escreve em grupos. As respostas de gestão vão só para a conversa direta de quem pediu. A única mensagem que o agente manda sem ter recebido pergunta é o aviso de conclusão de uma exclusão pedida pelo próprio usuário. 🟢
   - Origem: `_reversa_sdd/addenda/004-captura-ao-vivo-grupo-teste.md` (RN-08 da S3); ADR-0009 (risco de bloqueio)
   - Tipo: alterada (abre só a exceção do aviso de exclusão)
9. **RN-09:** O comando de operador `npm run whatsapp:grupos` continua valendo, com as mesmas regras de consentimento e auditoria. Pelo agente e pelo terminal, a regra de gestão é a mesma. 🟡
   - Origem: `_reversa_sdd/addenda/004-captura-ao-vivo-grupo-teste.md`
   - Tipo: alterada
10. **RN-10:** A base legal adotada para guardar mensagens de terceiros é o consentimento, declarado por grupo. Só é acompanhado o grupo em que o usuário confirma que os participantes foram informados e concordam (RN-04). A S5 não amplia isso. Acompanhar grupos sem esse consentimento, sob outra base legal, exige uma decisão nova e registrada. 🟢
    - Origem: `_reversa_sdd/sdd/identity-and-sources.md#14. Open Questions` (OQ-01); `docs/plano-de-fatias.md#Status` (pendência da S5); esclarecimento de 2026-11-24
    - Tipo: alterada (a pendência OQ-01 fica decidida)
11. **RN-11:** Uma pergunta que cita o nome de uma conversa do espaço restringe a busca a ela. Exemplos: "em qual áudio do T3 falaram de X?" e "no Contas da Casa, quem falou de Y?". As regras de reconhecimento:
    - vale o nome completo da conversa, sem diferenciar maiúsculas, acentos e espaços extras;
    - o nome sai dos termos de busca;
    - se a pergunta citar o nome de mais de uma conversa, vale o mais longo;
    - se duas conversas tiverem o mesmo nome, o agente lista as opções e não busca;
    - sem nome reconhecido, a busca é no espaço inteiro, como hoje.

    O filtro se combina com o "em qual áudio" da E001 da S4. 🟡
    - Origem: pedido do usuário na demonstração da S4 (2026-11-24); `_reversa_sdd/sdd/conversational-agent.md#11` (EC-06); esclarecimento de 2026-11-24
    - Tipo: nova

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | O sistema deve exigir prova de posse do número por código de uso único antes de ativar uma conta de canal (RN-02). | Must | Uma conta vinculada fica `pending`, e suas perguntas e comandos são recusados sem acessar nenhum espaço. O código certo dentro de 10 min a ativa. Um código expirado, já usado ou errado 5 vezes não ativa | 🟡 |
| RF-02 | O agente deve listar, a pedido ("grupos", "meus grupos"), as conversas do espaço do remetente, numeradas e com o estado (RN-03). | Must | Com 55 grupos no número de captura e 3 conversas importadas, "grupos" devolve todos, numerados, com o estado de cada um. Listas longas vêm em partes, e "mais" mostra a próxima | 🟡 |
| RF-03 | O agente deve começar a acompanhar um grupo em dois passos, com a confirmação de consentimento (RN-04). | Must | "acompanhar 4" devolve o pedido de confirmação com o nome do grupo. A confirmação em até 5 min autoriza a captura e registra a declaração. Sem confirmação, nada muda | 🟡 |
| RF-04 | O agente deve parar de acompanhar um grupo, com efeito imediato (RN-05). | Must | Depois de "parar T3", uma mensagem nova no T3 não é guardada, e uma pergunta ainda encontra o histórico | 🟢 |
| RF-05 | O agente deve apagar uma conversa (grupo ou importada) com confirmação explícita e avisar quando a exclusão terminar (RN-06). | Must | Depois de "apagar T3" e "confirmo apagar T3":<br>• uma pergunta sobre o T3 não traz nada já na resposta seguinte;<br>• em até 5 min, não há mensagem, trecho, anexo, transcrição nem arquivo de mídia da fonte;<br>• o usuário recebe o aviso com as quantidades.<br>Uma confirmação com outro nome, ou depois de 5 min, não apaga nada | 🟡 |
| RF-06 | A exclusão deve ser retomável e idempotente. Se o armazenamento de mídia falhar, ela tenta de novo por até 24 h e depois alerta o operador. | Must | Com o armazenamento fora do ar, a fonte continua `deleting` e sem aparecer nas respostas. Quando o armazenamento volta, a exclusão termina. Reiniciar o worker no meio não deixa sobra nem apaga duas vezes | 🟡 |
| RF-07 | O sistema deve descartar mensagens de fonte `deleting` ou parada, ao vivo ou por importação, e contar o descarte (EC-04). | Must | Uma mensagem ao vivo do grupo em exclusão não é gravada nem baixada, e a métrica de descarte sobe. Importar a conversa durante a exclusão é recusado com aviso | 🟡 |
| RF-08 | O agente deve resolver a conversa pelo número da última lista ou pelo nome, sem agir em caso de dúvida (RN-03). | Must | "parar contas" com duas conversas que contêm "contas" devolve as opções e não muda nada. "acompanhar 4" depois de 30 min pede uma lista nova | 🟡 |
| RF-09 | O sistema deve registrar os eventos de auditoria da RN-07 e permitir ao operador consultá-los por comando, sem conteúdo de mensagem. | Should | Cada ação gera um evento. O comando de auditoria mostra ação, alvo, quem e quando, sem texto de mensagem | 🟡 |
| RF-10 | A ajuda do agente deve listar os comandos de gestão. | Should | "ajuda" mostra os comandos de grupos com um exemplo de cada | 🟢 |
| RF-11 | Os comandos de gestão devem ficar no núcleo do agente, neutros quanto ao canal, e funcionar pelo canal de teste e pelo WhatsApp. | Must | Os mesmos cenários de gestão passam no E2E pelo canal de teste e pelo WhatsApp simulado | 🟢 |
| RF-12 | O sistema deve expor métricas e painel de gestão: comandos por tipo e resultado, exclusões em andamento e a duração delas, e um alerta de exclusão parada. | Should | O painel mostra as exclusões em andamento. Uma exclusão parada por mais de 30 min dispara o alerta | 🟡 |
| RF-13 | O comando de operador `whatsapp:grupos` deve ganhar `apagar`, com as mesmas regras (RN-09). | Could | `npm run whatsapp:grupos -- apagar <grupo> --confirmar "<nome>"` apaga como pelo agente e gera a mesma auditoria | 🟡 |
| RF-14 | O agente deve restringir a busca à conversa cujo nome a pergunta cita (RN-11). | Must | "em qual áudio do T3 falaram de Titanium?" traz só áudios do T3, mesmo que outro grupo tenha um áudio sobre Titanium. Uma pergunta sem nome de conversa busca em todas | 🟡 |
| RF-15 | Na subida da S5, o sistema deve voltar para `pending` as contas ativas sem verificação, e o `whatsapp:link` deve emitir o código de verificação (RN-02). | Must | Depois da migração, a conta pessoal da S2 recebe só a instrução de verificação. Com o código do `whatsapp:link` mandado ao agente, ela volta a perguntar e gerenciar | 🟢 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Desempenho | Resposta a um comando de gestão em até 3 s, sem contar o envio pelo WhatsApp | Padrão de resposta do agente (S2) | 🟡 |
| Desempenho | Exclusão concluída em até 5 min para uma fonte de até 10.000 mensagens e 200 áudios, como o T3 | `identity-and-sources.md#7` RNF-03 | 🟡 |
| Segurança | Código de verificação com hash, uso único, 10 min e até 5 tentativas. Confirmações de acompanhar e apagar expiram em 5 min e valem só para o mesmo remetente e a mesma conversa | `identity-and-sources.md#7` RNF-02; `conversational-agent.md#12` | 🟡 |
| Segurança | Nenhum comando revela conversas, contas ou existência de dados de outro espaço. Remetente desconhecido continua recebendo silêncio no WhatsApp | `identity-and-sources.md#11` EC-01 e EC-05; adendo 003 | 🟢 |
| Privacidade | Logs, métricas e erros sem nome de grupo, sem telefone e sem conteúdo. A auditoria guarda o id da fonte e as quantidades, sem texto de mensagem | Regra dos exports reais (2026-11-23); `identity-and-sources.md#12` | 🟡 |
| Privacidade | Depois da exclusão, não sobra dado da fonte no banco nem no armazenamento de mídia, inclusive em jobs pendentes | `identity-and-sources.md#3` (0 registros remanescentes) | 🟡 |
| Confiabilidade | A exclusão é um job retomável: reiniciar o processo no meio continua de onde parou, sem duplicar o aviso ao usuário | `identity-and-sources.md#11` EC-03 | 🟡 |
| Risco de bloqueio | O agente só fala com quem falou com ele, com a única exceção do aviso de exclusão concluída (RN-08) | ADR-0009 | 🟢 |
| Observabilidade | Painel de gestão no Grafana e alerta de exclusão parada, no padrão dos painéis da S2 a S4 | Padrão dos painéis anteriores | 🟡 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Listar os grupos e as conversas
  Dado o usuário com a conta verificada
  E o número de captura em 5 grupos, um deles acompanhado
  E a conversa "T3" importada
  Quando o usuário manda "grupos" ao agente
  Então recebe as 6 conversas numeradas, cada uma com o estado

Cenário: Acompanhar um grupo com confirmação de consentimento
  Dado a lista mostrada há menos de 30 min, com "Projeto X" no item 4, não acompanhado
  Quando o usuário manda "acompanhar 4"
  Então o agente pede a confirmação citando "Projeto X" e o consentimento dos participantes
  Quando o usuário confirma em até 5 min
  Então o grupo passa a ser acompanhado e a auditoria registra quem, quando e a declaração
  E uma mensagem nova no "Projeto X" aparece nas respostas

Cenário: Confirmação que não chega não autoriza
  Dado o pedido de confirmação para acompanhar "Projeto X"
  Quando passam 5 min sem confirmação
  Então o grupo continua não acompanhado
  E uma confirmação tardia recebe o aviso de que o pedido expirou

Cenário: Parar de acompanhar
  Dado o grupo "T3" acompanhado
  Quando o usuário manda "parar T3"
  Então uma mensagem nova no "T3" não é guardada
  E uma pergunta sobre o histórico do "T3" ainda é respondida

Cenário: Apagar uma conversa com tudo o que veio dela
  Dado a conversa "T3" com mensagens, áudios guardados e transcrições
  Quando o usuário manda "apagar T3"
  E confirma com "confirmo apagar T3" em até 5 min
  Então a resposta seguinte sobre o T3 não traz nada
  E em até 5 min não sobra mensagem, trecho, anexo, transcrição nem arquivo de mídia do T3
  E o usuário recebe o aviso com a quantidade de mensagens e de áudios apagados
  E a auditoria registra o pedido e a conclusão

Cenário: Confirmação com outro nome não apaga
  Dado o pedido para apagar "T3"
  Quando o usuário responde "confirmo apagar Contas da Casa"
  Então nada é apagado e o agente explica que a confirmação precisa citar "T3"

Cenário: Mensagem durante a exclusão é descartada
  Dado o grupo "T3" em exclusão
  Quando chega uma mensagem nova no "T3"
  Então ela não é gravada nem baixada e a métrica de descarte sobe

Cenário: Armazenamento de mídia fora do ar durante a exclusão
  Dado o pedido de exclusão confirmado
  E o armazenamento de mídia fora do ar
  Então a fonte continua em exclusão, sem aparecer nas respostas
  Quando o armazenamento volta
  Então a exclusão termina e o usuário recebe um único aviso

Cenário: Nome ambíguo não age
  Dado duas conversas cujo nome contém "contas"
  Quando o usuário manda "apagar contas"
  Então o agente lista as duas opções e não muda nada

Cenário: Número de uma lista antiga
  Dado a última lista mostrada há mais de 30 min
  Quando o usuário manda "acompanhar 4"
  Então o agente pede para ver a lista de novo e não muda nada

Cenário: Comando dentro de um grupo é ignorado
  Dado o grupo "T3" acompanhado
  Quando alguém escreve "apagar T3" dentro do grupo
  Então a mensagem é guardada como conversa comum e nada é apagado

Cenário: Conta sem verificação não gerencia
  Dado um número vinculado e ainda pendente
  Quando ele manda "grupos" ao agente
  Então nenhum espaço é consultado e só o caminho de verificação é aceito

Cenário: Verificar a conta mandando o código do terminal
  Dado o operador rodou "npm run whatsapp:link" com o número pessoal
  E o terminal mostrou um código válido por 10 min
  Quando o usuário manda esse código do próprio WhatsApp ao agente
  Então a conta fica ativa e o agente confirma a verificação
  E a auditoria registra o vínculo e a verificação

Cenário: Conta ativa sem verificação volta a pendente na subida da S5
  Dado a conta pessoal ativa desde a S2, sem verificação
  Quando a migração da S5 é aplicada
  Então a conta fica pendente
  E uma pergunta dela recebe só a instrução de verificação

Cenário: Pergunta citando o grupo busca só nele
  Dado áudios sobre "Titanium" no "T3" e em outro grupo
  Quando o usuário pergunta "em qual áudio do T3 falaram de Titanium?"
  Então a resposta cita só áudios do "T3"

Cenário: Nome de conversa repetido na pergunta
  Dado duas conversas chamadas "Família"
  Quando o usuário pergunta "na Família, quem falou do Natal?"
  Então o agente lista as duas opções e não busca

Cenário: Código de verificação errado 5 vezes
  Dado um código de verificação válido
  Quando 5 tentativas erradas são feitas
  Então o código é invalidado e a conta continua pendente até um novo pedido

Cenário: Importar de novo depois de apagar
  Dado a conversa "T3" apagada
  Quando o usuário importa o export do T3 de novo
  Então a conversa volta como fonte nova, sem resto da anterior

Cenário: Auditoria consultável sem conteúdo
  Dado um grupo acompanhado, parado e apagado
  Quando o operador consulta a auditoria
  Então vê as quatro ações com alvo, quem e quando, e as quantidades da exclusão
  E nenhum texto de mensagem

Cenário: Ajuda mostra os comandos de gestão
  Quando o usuário manda "ajuda"
  Então a resposta lista "grupos", "acompanhar", "parar" e "apagar", com um exemplo de cada

Cenário: Exclusão parada dispara alerta
  Dado uma exclusão em andamento há mais de 30 min
  Então o alerta de exclusão parada dispara e o painel mostra a fonte em exclusão, sem o nome do grupo

Cenário: Apagar pelo terminal
  Quando o operador roda "npm run whatsapp:grupos -- apagar 4 --confirmar \"Projeto X\""
  Então o grupo é apagado como pelo agente e a auditoria registra a ação
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|---------------|
| RF-01, RF-15 | Must | Comandos destrutivos pelo celular exigem saber que o número é do dono (RN-01, RN-02), inclusive a conta vinculada antes da S5 |
| RF-14 | Must | Pedido do usuário na demonstração da S4, decidido para esta fatia no esclarecimento |
| RF-02, RF-03, RF-04, RF-08 | Must | É o resultado da fatia: gerenciar grupos conversando com o agente, sem errar de grupo |
| RF-05, RF-06, RF-07 | Must | Apagar com tudo o que veio da fonte é exigência de privacidade do PRD desde o MVP |
| RF-11 | Must | Mantém o núcleo independente do canal (WhatsApp-first, not only) |
| RF-09, RF-10, RF-12 | Should | Auditoria consultável, ajuda e painel tornam a gestão verificável, mas não mudam o que a fatia entrega |
| RF-13 | Could | O terminal continua útil ao operador; o caminho principal é o agente |
| Retenção configurável (`identity-and-sources.md` RF-08) | Won't (S5) | Não está no plano da S5; o caminho de exclusão em cascata desta fatia é o que a retenção vai reutilizar |
| Interface web, vários usuários e papéis | Won't | Fora da v0.1 (`identity-and-sources.md#4`) |

## 9. Esclarecimentos

### Sessão 2026-11-24

- **Q:** Qual base legal da LGPD a S5 adota para guardar mensagens de terceiros dos grupos acompanhados?
  **R:** Consentimento declarado por grupo, como hoje: só grupos em que o usuário confirma que os participantes sabem e concordam. Aplicado na RN-10. A OQ-01 de `identity-and-sources` fica decidida.
- **Q:** Por onde circula o código de verificação da conta?
  **R:** O `npm run whatsapp:link` mostra o código no terminal, e o usuário o manda do próprio WhatsApp ao agente. Aplicado na RN-02.
- **Q:** A conta pessoal já ativa desde a S2 precisa ser verificada de novo?
  **R:** Sim. Na subida da S5, toda conta ativa sem verificação volta para pendente até mandar o código. Aplicado na RN-02 e na nova RF-15.
- **Q:** Perguntar citando o grupo ("em qual áudio do T3 falaram de X?") entra nesta fatia?
  **R:** Sim. O nome da conversa vira filtro da busca e deixa de ser termo procurado, com as mesmas regras de ambiguidade. Aplicado na nova RN-11 e na nova RF-14.

## 10. Lacunas

- 🟡 Acompanhar grupos sem o consentimento declarado (outra base legal) continua fora do escopo e exige uma decisão nova (RN-10). Este documento não é parecer jurídico.
- 🟡 Reconhecer o grupo por apelido ou por parte do nome, como "T3" para "T3 - Titanium Tech", fica de fora na pergunta (RN-11): vale só o nome completo. Nos comandos de gestão, o trecho que identifica uma única conversa é aceito (RN-03).

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-24 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-11-24 | `/reversa-clarify`: 4 decisões, sobre a base legal (consentimento por grupo), o caminho do código de verificação, a nova verificação das contas já ativas (nova RF-15) e o filtro por grupo na pergunta (nova RN-11 e nova RF-14) | reversa |
