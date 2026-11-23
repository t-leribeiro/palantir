# Requirements: Captura ao vivo de um grupo de teste autorizado (fatia S3)

> Identificador: `004-captura-ao-vivo-grupo-teste`
> Data: `2026-11-23`
> Pasta da extração reversa: `_reversa_sdd/` (greenfield: `prd.md`, specs em `sdd/` e adendos 001, 002 e 003)
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

Um número de captura, que participa de um grupo de teste, passa a receber as mensagens novas do grupo e a guardá-las como conhecimento, depois que o operador autoriza explicitamente aquele grupo. Em poucos segundos, uma mensagem dita no grupo já aparece nas respostas do agente pelo WhatsApp, com autor, grupo e data. Quando o grupo também tiver histórico importado, a mesma mensagem nunca aparece duas vezes. Hoje o Palantír só conhece o passado exportado à mão (S1). Esta fatia faz a memória acompanhar a conversa enquanto ela acontece. Só texto: áudios e outras mídias ficam para a S4.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#6. Requisitos Funcionais` | RF-03 listar conversas como fonte `not_authorized`, RF-04 mensagem de conversa autorizada vira `CanonicalMessage` com `captureMethod=live` e `externalMessageId`, RF-05 descartar sem baixar mídia o que não é autorizado, RF-07 reconexão sem perder o que o provedor reentrega | 🟡 |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#11. Edge Cases e Tratamento de Erros` | EC-01 número bloqueado, EC-03 mensagem duplicada na reconexão, EC-05 mudança de formato do provedor | 🟡 |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#14. Open Questions` | OQ-01 respondida em 2026-11-23: dois números (agente e captura); só existe hoje o chip do agente | 🟢 |
| `_reversa_sdd/sdd/ingestion.md#6. Requisitos Funcionais` | RF-01 rejeitar fonte não autorizada, RF-02 deduplicar por (`source_id`, `external_message_id`), RF-04 reconciliar importada × ao vivo (fonte, autor, conteúdo normalizado e diferença ≤ 60 s), RF-09 métricas por método de captura | 🟡 |
| `_reversa_sdd/sdd/ingestion.md#14. Open Questions` | OQ-01: a janela de 60 s basta, se a exportação só mostra hora e minuto? | 🟡 |
| `_reversa_sdd/sdd/identity-and-sources.md#6. Requisitos Funcionais` | RF-04 toda conversa conhecida nasce `not_authorized`, RF-05 autorizar e revogar, RF-06 consulta "a fonte está autorizada?", RF-10 auditoria de autorizações e revogações | 🟡 |
| `_reversa_sdd/sdd/identity-and-sources.md#14. Open Questions` | OQ-01 base legal (LGPD) antes de uso fora do ambiente de teste; OQ-02 revogar só para a captura (adotado) | 🟡 |
| `_reversa_sdd/prd.md#8. Riscos` | Exposição de dados de terceiros dos grupos: opt-in por conversa, isolamento, exclusão e retenção | 🟡 |
| `_reversa_sdd/addenda/002-perguntar-historico-importado.md#Impacto por artefato da extração` | A conversa importada vira fonte autorizada da conta WhatsApp do dono, com id `export:<nome>`; os autores importados são identificados pelo nome mostrado no export | 🟢 |
| `_reversa_sdd/addenda/003-perguntar-pelo-whatsapp.md#Impacto por artefato da extração` | Adaptador do agente pronto: sessão criptografada, reconexão, recibos, observabilidade; o número do agente descarta grupos; captura (RF-03 a RF-05) pendente para a S3 | 🟢 |
| `docs/plano-de-fatias.md#Plano` | S3: mensagem nova num grupo de teste autorizado aparece nas respostas em segundos, sem duplicar a importação; decisões pendentes: grupo de teste, consentimento e segundo número | 🟢 |

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| P1, Profissional conectado (`_reversa_sdd/personas.md#Persona 1`) | Ter na memória também o que foi dito hoje, não só o que exportou | Alguém recomenda uma ferramenta no grupo de manhã; à tarde ele pergunta ao agente e recebe autor, grupo e horário |
| Operador (hoje, o próprio usuário) | Colocar o número de captura no grupo de teste e autorizar só aquele grupo | Adiciona o número do agente (que captura provisoriamente) ao grupo, lista os grupos, autoriza o grupo de teste declarando o consentimento e acompanha a captura no painel |
| Participante do grupo de teste | Saber que o grupo está sendo guardado e poder sair dessa captura | Foi avisado e consentiu antes da autorização; se desistir, o operador revoga e a captura para |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** Nenhum grupo é capturado por padrão. Todo grupo que o número de captura conhece nasce `not_authorized`, e só uma autorização explícita do operador, por grupo, faz suas mensagens serem guardadas. Mensagens anteriores à autorização não são buscadas no WhatsApp. 🟡
   - Origem: `_reversa_sdd/sdd/identity-and-sources.md#6. Requisitos Funcionais` (RF-04, RF-05)
   - Tipo: nova (primeira captura real)
2. **RN-02:** Autorizar um grupo exige que os participantes tenham sido informados e tenham consentido. O operador declara isso no comando de autorização, com um texto livre obrigatório (ex.: `--consentimento "todos avisados em 23/11, ninguém se opôs"`), que fica no registro de auditoria junto de quem autorizou e quando. O sistema não envia aviso ao grupo: nenhum número escreve em grupos (RN-08). 🟢
   - Esclarecido em 2026-11-23 (sessão de `/reversa-clarify`)
   - Origem: `_reversa_sdd/sdd/identity-and-sources.md#14. Open Questions` (OQ-01) e `_reversa_sdd/prd.md#8. Riscos`
   - Tipo: nova
3. **RN-03:** A meta continua sendo dois números (agente e captura), para que um bloqueio num não derrube o outro. Enquanto o segundo chip não existe, o número do agente também captura: mensagens de grupo autorizado viram conhecimento e mensagens diretas continuam sendo perguntas ao agente, como na S2. Uma configuração escolhe entre o modo de um número e o de dois números; trocar para o número dedicado não exige mudança de código, só pareamento e configuração. 🟢
   - Esclarecido em 2026-11-23 (sessão de `/reversa-clarify`); risco aceito: no modo de um número, um bloqueio causado pela captura também derruba as respostas
   - Origem: `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#14. Open Questions` (OQ-01) e `_reversa_sdd/addenda/003-perguntar-pelo-whatsapp.md` (RN-01 da S2)
   - Tipo: alterada se a opção provisória for escolhida
4. **RN-04:** Uma mensagem real é guardada uma única vez por fonte, venha ela ao vivo, reentregue na reconexão ou de uma importação posterior. Ao vivo, a chave é o id da mensagem no WhatsApp. Entre ao vivo e importada, que não tem esse id, a regra é: mesma fonte, mesmo texto normalizado e diferença de horário de até 60 s; a mensagem fica com as duas proveniências. 🟡
   - Origem: `_reversa_sdd/sdd/ingestion.md#6. Requisitos Funcionais` (RF-02, RF-04)
   - Tipo: alterada. O autor deixa de ser critério obrigatório da reconciliação, porque a importação só conhece o nome que aparece no celular de quem exportou e a captura conhece o número e o nome de perfil. O nome entra só como desempate entre candidatas iguais.
5. **RN-05:** Para guardar um grupo ao vivo junto de uma conversa já importada, os dois precisam ser a mesma fonte: as perguntas citam um único grupo e a reconciliação compara dentro dele. O operador indica a ligação no comando de autorização (ex.: `--conversa "T3"`); sem a indicação, o grupo vira uma fonte nova. Não há casamento automático pelo nome. Uma importação posterior com o mesmo nome de conversa cai na mesma fonte. 🟢
   - Esclarecido em 2026-11-23 (sessão de `/reversa-clarify`)
   - Origem: `_reversa_sdd/addenda/002-perguntar-historico-importado.md` (fonte `export:<nome>`) e `_reversa_sdd/sdd/ingestion.md#6. Requisitos Funcionais` (RF-04)
   - Tipo: nova
6. **RN-06:** Revogar um grupo para a captura imediatamente: mensagens novas deixam de ser guardadas, e as já guardadas continuam pesquisáveis até serem apagadas, o que é escopo da S5. 🟡
   - Origem: `_reversa_sdd/sdd/identity-and-sources.md#14. Open Questions` (OQ-02, adotado: apenas parar)
   - Tipo: nova
7. **RN-07:** Nesta fatia, só texto vira conhecimento. Áudio, imagem, documento, figurinha e enquete de grupo autorizado são contados por tipo e descartados sem download. Edições e exclusões feitas depois no WhatsApp não alteram o que já foi guardado. 🟡
   - Origem: `docs/plano-de-fatias.md` (mídia na S4) e `_reversa_sdd/sdd/ingestion.md#4. Non-Goals (Fora do Escopo)` (NG-01)
   - Tipo: nova
8. **RN-08:** Nenhum número escreve em grupos. No modo de dois números, o número de captura também não responde a mensagens diretas: elas são descartadas, sem virar pergunta nem conhecimento. No modo de um número, mensagens diretas seguem as regras da S2 (pergunta ao agente). 🟡
   - Origem: `_reversa_sdd/addenda/003-perguntar-pelo-whatsapp.md` (RN-05 da S2: o agente não inicia conversas) e RN-03 desta feature
   - Tipo: nova
9. **RN-09:** Grupo autorizado e grupo de outros donos ficam isolados: as mensagens capturadas pertencem ao espaço do usuário que autorizou o grupo e só aparecem nas respostas desse usuário. 🟡
   - Origem: `_reversa_sdd/sdd/ingestion.md#7. Requisitos Não-Funcionais` (RNF-03) e `_reversa_sdd/sdd/conversational-agent.md#6. Requisitos Funcionais` (RF-01)
   - Tipo: inalterada, nova origem de dados
10. **RN-10:** Nas respostas, o autor de uma mensagem capturada ao vivo aparece pelo nome de perfil que a própria pessoa usa no WhatsApp; sem nome de perfil, aparece o número mascarado (ex.: `+55 11 9****-**77`). Por isso a mesma pessoa pode aparecer com um nome nas mensagens importadas e com outro nas capturadas; unificar autores fica fora desta fatia. 🟢
   - Origem: `_reversa_sdd/sdd/ingestion.md#4. Non-Goals (Fora do Escopo)` (NG-02) e esclarecimento de 2026-11-23
   - Tipo: nova

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | O sistema deve capturar pelo número configurado (RN-03): no modo de um número, pela sessão já pareada do agente, sem novo QR; no modo de dois números, por um número de captura pareado por QR Code no terminal, com sessão num arquivo criptografado separado da do agente, reconectando sozinho ao reiniciar. | Must | No modo de um número, autorizar um grupo do número do agente basta para capturar, sem novo pareamento; no modo de dois números, ler o QR deixa a captura em `connected` no health, reiniciar volta a `connected` sem QR e o arquivo da captura é diferente do arquivo do agente e ilegível em texto puro. | 🟢 |
| RF-02 | O sistema deve permitir ao operador listar, por comando, os grupos de que o número de captura participa, com nome, quantidade de participantes e status de autorização. | Must | Num número que está em 3 grupos, o comando mostra os 3, todos `not_authorized` antes de qualquer autorização. | 🟡 |
| RF-03 | O sistema deve permitir ao operador autorizar um grupo por comando, com a declaração de consentimento obrigatória (RN-02), o dono e o momento, e com `--conversa` opcional para ligar o grupo a uma conversa importada (RN-05). | Must | Depois do comando, o grupo aparece como `authorized` na listagem; a autorização tem registro de auditoria com quem, quando e a declaração; sem `--consentimento`, o comando recusa; com `--conversa "T3"`, as mensagens capturadas caem na mesma fonte da importação "T3". | 🟢 |
| RF-04 | O sistema deve guardar cada mensagem de texto nova de grupo autorizado como conhecimento do dono, com autor (número e nome de perfil), grupo, horário e id da mensagem no WhatsApp. | Must | Uma mensagem de texto enviada no grupo autorizado pode ser encontrada numa pergunta ao agente em até 10 s, com autor (RN-10), grupo e horário corretos na citação. | 🟢 |
| RF-05 | O sistema deve descartar, sem gravar nem baixar nada, mensagens de grupos não autorizados ou revogados e, no modo de dois números, mensagens diretas recebidas pelo número de captura (RN-08). | Must | Mensagens enviadas num grupo não autorizado não geram registro; no modo de dois números, uma mensagem direta ao número de captura também não; a métrica de descartadas por motivo aumenta. | 🟢 |
| RF-06 | O sistema deve guardar uma única vez a mensagem que o WhatsApp entregar de novo, na reconexão ou no reinício do processo. | Must | A mesma mensagem entregue 3 vezes resulta em 1 registro e 1 citação possível. | 🟡 |
| RF-07 | O sistema deve reconciliar uma importação posterior com as mensagens já capturadas ao vivo do mesmo grupo (RN-04): nenhuma mensagem duplicada e a capturada passa a ter também a proveniência da importação. | Must | Capturar 20 mensagens ao vivo e depois importar um export que as contém resulta em 20 registros, não 40; o relatório da importação mostra 20 reconciliadas. | 🟡 |
| RF-08 | O sistema deve permitir ao operador revogar a captura de um grupo por comando, com efeito imediato e registro de auditoria. | Must | Depois de revogar, uma mensagem nova no grupo não é gravada; as mensagens anteriores continuam nas respostas. | 🟡 |
| RF-09 | O sistema deve contar, por tipo, as mensagens de mídia de grupos autorizados e descartá-las sem download nesta fatia (RN-07). | Should | Um áudio enviado no grupo autorizado não gera registro nem download e incrementa a métrica de mídia ignorada com `kind=audio`. | 🟡 |
| RF-10 | O sistema deve expor no health e em métricas o estado da sessão de captura e as contagens de mensagens capturadas, duplicadas, reconciliadas e descartadas por motivo, por grupo autorizado. | Must | O painel mostra o estado da captura e as contagens; encerrar a sessão no celular leva o estado a `logged_out` em até 60 s, com alerta. | 🟡 |
| RF-11 | O sistema deve permitir ligar e desligar a captura por configuração, sem afetar o agente, a importação nem as consultas. | Must | Com a captura desligada, nenhuma sessão de captura conecta e os testes do agente e da importação continuam verdes. | 🟡 |
| RF-12 | O adaptador de captura deve passar a suíte de contrato do canal com capacidade de captura ao vivo, usando o provedor simulado. | Must | A suíte roda os testes de captura (hoje pulados para o WhatsApp) e passa na esteira, sem rede e sem número real. | 🟢 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Desempenho | Do envio no grupo até a mensagem estar pesquisável: até 10 s no P95, com o worker rodando, em máquina local | Plano de fatias ("aparece nas respostas em segundos"); `whatsapp-baileys-adapter.md#7` RNF-01 (P95 < 2 s até a ingestão) | 🟡 |
| Desempenho | Captura de uma rajada de 200 mensagens em 1 minuto sem perda e sem duplicata | `ingestion.md#3` (zero duplicatas no corpus de teste) | 🟡 |
| Segurança | Sessão de captura criptografada (AES-256-GCM) fora do banco e do repositório; a biblioteca não oficial continua importada só no arquivo do provedor (regra `whatsapp-lib-isolated`) | `_reversa_sdd/addenda/003-perguntar-pelo-whatsapp.md`; ADR-0009 | 🟢 |
| Privacidade | Logs, métricas e erros sem texto de mensagem, sem número de telefone e sem nome de participante; o nome do grupo só aparece mascarado ou pelo id interno | `whatsapp-baileys-adapter.md#12`; teste de logs da S2 | 🟡 |
| Privacidade | Consentimento e autorização auditados (quem, quando, qual grupo); exports e dados reais do grupo de teste nunca entram no repositório | `identity-and-sources.md#6` RF-10; decisão de 2026-11-23 sobre `exports/` | 🟢 |
| Disponibilidade | Reconexão da captura em até 60 s, com backoff de 1 a 60 s, sem afetar o agente | `whatsapp-baileys-adapter.md#7` RNF-02 | 🟡 |
| Recursos | Até 300 MB de memória para o processo de captura | `whatsapp-baileys-adapter.md#7` RNF-04 | 🟡 |
| Observabilidade | Painel "WhatsApp" ganha a captura (estado, capturadas, descartadas por motivo, reconciliadas); alerta quando a captura cai para `logged_out` | Padrão do painel e dos alertas da S2 | 🟡 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Mensagem do grupo autorizado aparece na resposta em segundos
  Dado o grupo de teste autorizado, com o consentimento registrado
  E o worker rodando
  Quando um participante escreve "recomendo o Grafana Tempo para traces" no grupo
  E, 10 segundos depois, o usuário pergunta ao agente "quem recomendou o Tempo?"
  Então a resposta cita o participante, o grupo de teste e o horário da mensagem

Cenário: Grupo não autorizado não é guardado
  Dado um grupo de que o número de captura participa, sem autorização
  Quando alguém escreve nesse grupo
  Então nada é gravado
  E uma pergunta sobre o assunto recebe "Não encontrei evidências suficientes."

Cenário: Autorizar ligando à conversa importada
  Dado a conversa "T3" importada e o grupo correspondente listado como not_authorized
  Quando o operador autoriza o grupo com --consentimento e --conversa "T3"
  Então as mensagens capturadas do grupo ficam na mesma fonte das importadas de "T3"
  E as citações mostram a mesma conversa para as duas

Cenário: Autorizar sem consentimento é recusado
  Dado um grupo listado como not_authorized
  Quando o operador tenta autorizá-lo sem registrar o consentimento
  Então o comando recusa e explica o que falta
  E o grupo continua not_authorized

Cenário: Mensagem reentregue na reconexão não duplica
  Dado o grupo autorizado e a captura conectada
  Quando a conexão cai e o WhatsApp entrega de novo as últimas 5 mensagens
  Então cada mensagem existe uma única vez

Cenário: Importação depois da captura não duplica
  Dado 20 mensagens capturadas ao vivo no grupo autorizado ligado à conversa importada
  Quando o operador importa um novo export do mesmo grupo que contém essas 20 mensagens
  Então o relatório mostra 20 reconciliadas
  E uma pergunta sobre uma delas recebe uma única citação

Cenário: Revogar para a captura imediatamente
  Dado o grupo autorizado
  Quando o operador revoga a captura
  E alguém escreve no grupo
  Então a mensagem nova não é gravada
  E as mensagens anteriores continuam nas respostas

Cenário: Mídia no grupo autorizado é só contada
  Dado o grupo autorizado
  Quando alguém manda um áudio no grupo
  Então nada é gravado nem baixado
  E a métrica de mídia ignorada aumenta com o tipo áudio

Cenário: Modo de um número: grupo vira conhecimento e mensagem direta continua sendo pergunta
  Dado o número do agente capturando provisoriamente, num grupo autorizado
  Quando alguém escreve no grupo
  E o usuário cadastrado manda "quem falou disso?" em mensagem direta
  Então a mensagem do grupo é guardada e a mensagem direta é respondida como pergunta
  E nenhuma resposta é enviada ao grupo

Cenário: Modo de dois números: mensagem direta ao número de captura é ignorada
  Dado a captura conectada por um número próprio
  Quando alguém manda mensagem direta ao número de captura
  Então nada é gravado e nada é respondido

Cenário: Modo de dois números: parear a captura uma vez e reiniciar sem QR
  Dado a captura ligada no modo de dois números e sem sessão de captura salva
  Quando o operador lê o QR Code com o celular do número de captura
  Então o health mostra a captura em connected
  E, ao reiniciar o processo, ela volta a connected sem novo QR Code

Cenário: Listar os grupos antes de autorizar
  Dado o número de captura em 3 grupos
  Quando o operador pede a listagem
  Então aparecem os 3 grupos, todos not_authorized

Cenário: Modo de dois números: sessão de captura encerrada no celular
  Dado a captura connected por um número próprio
  Quando o aparelho é desconectado no celular do número de captura
  Então em até 60 segundos o health mostra logged_out e o alerta dispara
  E o agente continua respondendo normalmente

Cenário: Captura desligada não conecta
  Dado a captura desligada na configuração
  Quando o processo sobe
  Então nenhuma sessão de captura conecta
  E o agente e a importação funcionam como antes

Cenário: Adaptador de captura passa a suíte de contrato
  Dado o provedor simulado
  Quando a suíte de contrato do canal roda com captura ao vivo habilitada
  Então os testes de captura passam, sem rede e sem número real

Cenário: Logs não expõem o grupo nem as pessoas
  Dado uma sessão de captura com 10 mensagens guardadas
  Quando os logs do processo são lidos
  Então não aparecem textos das mensagens, números de telefone nem nomes de participantes
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|---------------|
| RF-01, RF-11 | Must | Sem a escolha do número e o liga/desliga não há captura nem rollback; o modo de um número destrava a fatia sem o segundo chip |
| RF-02, RF-03, RF-08 | Must | Opt-in por grupo e revogação são a base de privacidade do produto |
| RF-04 | Must | É o resultado visível da fatia |
| RF-05 | Must | Nada fora do grupo autorizado pode ser guardado |
| RF-06, RF-07 | Must | Duplicata quebra a confiança nas citações (meta de zero duplicatas) |
| RF-10 | Must | Captura parada sem aviso é perda silenciosa de memória |
| RF-12 | Must | Mantém o adaptador substituível (WhatsApp-first, not only) |
| RF-09 | Should | Prepara a S4 e mostra o volume de mídia, mas não muda o que a fatia entrega |
| RNF de desempenho (10 s) | Must | Define o "em segundos" do plano |
| RNF de privacidade | Must | Dados de terceiros num repositório público |

## 9. Esclarecimentos

### Sessão 2026-11-23

- **Q:** Qual número faz a captura dos grupos, se hoje só existe o chip do agente?
  **R:** O mesmo número do agente, provisoriamente: grupo autorizado vira conhecimento e mensagem direta continua sendo pergunta; uma configuração troca para o segundo número sem mudar código. Reflexo: RN-03, RN-08, RF-01, RF-05 e cenários dos dois modos.
- **Q:** Como o consentimento do grupo é registrado?
  **R:** Declaração obrigatória do operador no comando de autorização, guardada em auditoria; o número nunca escreve no grupo. Reflexo: RN-02 e RF-03.
- **Q:** Como o grupo capturado ao vivo é ligado à conversa já importada?
  **R:** O operador indica no comando de autorização (`--conversa "T3"`); sem indicação, vira fonte nova; nada de casamento automático pelo nome. Reflexo: RN-05, RF-03 e cenário "Autorizar ligando à conversa importada".
- **Q:** Como aparece o autor de uma mensagem capturada ao vivo nas respostas?
  **R:** Pelo nome de perfil da pessoa no WhatsApp; sem ele, pelo número mascarado. Reflexo: nova RN-10 e RF-04.

## 10. Lacunas

- 🟡 Segundo chip (número de captura dedicado): quando existir, troca-se a configuração para o modo de dois números (RN-03).
- 🟡 Escolha do grupo de teste e coleta do consentimento dos participantes: ação do usuário fora do sistema, antes da demonstração.
- 🟡 Base legal (LGPD) para dados de terceiros: continua aberta (`identity-and-sources.md#14` OQ-01) e bloqueia uso fora de grupos de teste, não esta fatia.
- 🟡 Janela de 60 s da reconciliação (`ingestion.md#14` OQ-01): será medida na demonstração com o export real do grupo de teste.
- 🟡 Mensagem apagada para todos no WhatsApp continua guardada nesta fatia (RN-07); tratar exclusões é candidato para a S5.

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-23 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-11-23 | `/reversa-clarify`: 3 dúvidas resolvidas (número, consentimento, ligação com a importação) e nova RN-10 (autor nas respostas) | reversa |
