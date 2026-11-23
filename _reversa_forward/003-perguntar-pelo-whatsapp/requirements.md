# Requirements: Perguntar pelo WhatsApp ao número do agente (fatia S2)

> Identificador: `003-perguntar-pelo-whatsapp`
> Data: `2026-11-23`
> Pasta da extração reversa: `_reversa_sdd/` (specs 🟡 do `/reversa-new` + adendos vigentes `addenda/001-walking-skeleton.md`, `addenda/002-perguntar-historico-importado.md` e `addenda/bug-*`)
> Plano: `docs/plano-de-fatias.md`, fatia S2
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

O usuário passa a perguntar ao Palantír **pelo próprio WhatsApp**: manda uma mensagem de texto do seu número pessoal para o **número do agente** (o chip secundário) e recebe, na mesma conversa, a resposta com autor, conversa e data de cada evidência, sobre tudo que já está no seu espaço (hoje, o histórico importado na S1). É a primeira vez que o produto sai do canal de teste. O número do agente só conversa: capturar mensagens de grupos fica para a S3, com outro número.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#6. Requisitos Funcionais` | RF-01 pareamento por QR Code, RF-02 credenciais criptografadas, RF-07 reconexão com backoff, RF-08 renderização com partes ≤ 4.000 caracteres, RF-09 mensagem direta ao agente não vira conhecimento, RF-10 1 mensagem/s por destinatário, RF-11 estado da sessão | 🟡 |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#11. Edge Cases e Tratamento de Erros` | EC-01 número bloqueado, EC-03 reentrega na reconexão, EC-05 mudança de formato do provedor | 🟡 |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#14. Open Questions` | OQ-01 (um número ou dois) respondida pelo usuário em 2026-11-23: **dois números**, o chip secundário é o do agente | 🟢 |
| `_reversa_sdd/sdd/conversational-agent.md#6. Requisitos Funcionais` | RF-01 resolver usuário pela conta do remetente antes de qualquer busca, RF-05 "não encontrei evidências suficientes", RF-10 resposta neutra de canal | 🟡 |
| `_reversa_sdd/sdd/identity-and-sources.md#6. Requisitos Funcionais` | RF-02 conta de canal por (`provider`, `external_account_id`), RF-09 resolver usuário pelo remetente | 🟡 |
| `_reversa_sdd/sdd/identity-and-sources.md#11. Edge Cases e Tratamento de Erros` | EC-01 conta já vinculada a outro usuário, EC-05 remetente desconhecido | 🟡 |
| `_reversa_sdd/addenda/001-walking-skeleton.md#Impacto por artefato da extração` | Contrato do canal, agente determinístico com citações, busca textual e a suíte de contrato do canal já existem | 🟢 |
| `_reversa_sdd/addenda/002-perguntar-historico-importado.md#Impacto por artefato da extração` | A conta WhatsApp do dono existe como `pending`, com `external_account_id = unlinked:<user_id>`, dona das conversas importadas; "a S2 troca pelo número" | 🟢 |
| `docs/plano-de-fatias.md#Componentes (specs) por fatia` | S2 = adaptador WhatsApp só como interface do agente + cadastro do número por comando; verificação da conta pelo agente na S5 | 🟢 |

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| P1, Profissional conectado (`_reversa_sdd/personas.md#Persona 1`) | Lembrar o que foi dito num grupo sem rolar a conversa | Manda "quem recomendou o Temporal?" ao número do agente e recebe autor, grupo e data |
| P2, Gestor ou consultor com pouco tempo (`_reversa_sdd/personas.md#Persona 2`) | Consultar rápido, do celular, entre reuniões | Pergunta pelo WhatsApp e lê a resposta curta com as fontes |
| Operador (hoje, o próprio usuário) | Colocar o número do agente no ar e mantê-lo conectado | Pareia o chip lendo um QR Code, cadastra o número pessoal do usuário e acompanha o estado da sessão |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** O número do agente só conversa. Ele não captura conhecimento: mensagens de grupos que chegarem a ele e mensagens diretas são ignoradas como fonte; a captura de grupos é da S3, por outro número. 🟢
   - Origem: `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#14. Open Questions` (OQ-01, decisão de 2026-11-23)
   - Tipo: nova
2. **RN-02:** Só um número cadastrado e ativo acessa um espaço de conhecimento. Remetente desconhecido nunca recebe conteúdo do espaço e não dispara busca. 🟡
   - Origem: `_reversa_sdd/sdd/conversational-agent.md#6. Requisitos Funcionais` (RF-01) e `_reversa_sdd/sdd/identity-and-sources.md#11. Edge Cases e Tratamento de Erros` (EC-05)
   - Tipo: nova (primeira vez com remetentes reais)
3. **RN-03:** Cadastrar o número pessoal transforma a conta provisória `unlinked:<user_id>` na conta real do usuário, sem perder as conversas já importadas, que continuam pesquisáveis e citáveis. 🟡
   - Origem: `_reversa_sdd/addenda/002-perguntar-historico-importado.md#Impacto por artefato da extração`
   - Tipo: alterada
4. **RN-04:** Uma pergunta feita ao agente nunca vira conhecimento pesquisável. 🟡
   - Origem: `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#6. Requisitos Funcionais` (RF-09)
   - Tipo: nova
5. **RN-05:** O agente só responde a quem escreveu para ele; não inicia conversas nem envia mensagens em massa. 🟡
   - Origem: `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#4. Non-Goals (Fora do Escopo)` (NG-04)
   - Tipo: nova
6. **RN-06:** Toda afirmação factual da resposta cita autor, conversa e data; sem evidência suficiente, a resposta é "Não encontrei evidências suficientes." (regra já vigente, agora também no WhatsApp). 🟢
   - Origem: `_reversa_sdd/addenda/001-walking-skeleton.md#Impacto por artefato da extração`
   - Tipo: inalterada, novo canal
7. **RN-07:** Um número pessoal pertence a um único usuário; cadastrar um número já cadastrado para outro usuário é recusado sem revelar quem é o outro. 🟡
   - Origem: `_reversa_sdd/sdd/identity-and-sources.md#11. Edge Cases e Tratamento de Erros` (EC-01)
   - Tipo: nova

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | O sistema deve permitir que o operador pareie o número do agente lendo com o celular um QR Code exibido no terminal. | Must | Ler o QR Code deixa a sessão no estado `connected`, visível no health check. | 🟡 |
| RF-02 | O sistema deve guardar as credenciais da sessão num arquivo local criptografado, fora do banco e fora do repositório, com a chave também fora do repositório, e reconectar sozinho ao reiniciar. | Must | Reiniciar o processo volta a `connected` sem novo QR Code; recriar o ambiente local (apagar e subir de novo o banco) também não exige novo pareamento; o arquivo não é legível em texto puro e as credenciais não aparecem em logs. | 🟢 |
| RF-03 | O sistema deve permitir que o operador cadastre, por comando, o número pessoal de um usuário, convertendo a conta provisória dele em conta ativa com esse número, sem código de verificação nesta fatia (a verificação pelo WhatsApp entra na S5). | Must | Depois do cadastro, a conta WhatsApp do usuário tem o número informado e está ativa; as conversas importadas continuam pesquisáveis e citáveis; número inválido (fora do formato internacional) é recusado. | 🟢 |
| RF-04 | O sistema deve tratar cada mensagem direta de texto recebida pelo número do agente, vinda de número cadastrado e ativo, como pergunta ao agente e enviar a resposta na mesma conversa. | Must | Uma pergunta sobre o histórico importado recebe, pelo WhatsApp, resposta com autor, conversa e data da evidência; pergunta sem evidência recebe "Não encontrei evidências suficientes.". | 🟡 |
| RF-05 | O sistema deve ficar em silêncio diante de mensagem de número não cadastrado: sem busca, sem acesso a espaço e sem resposta, apenas contando o caso numa métrica de remetentes desconhecidos. | Must | Mensagem de número desconhecido não gera busca, acesso a espaço nem mensagem enviada (verificado por teste) e incrementa a métrica de remetentes desconhecidos. | 🟢 |
| RF-06 | O sistema deve ignorar, como pergunta e como conhecimento, mensagens de grupos recebidas pelo número do agente, e responder a mensagem direta que não é texto (áudio, imagem, documento) com um aviso de que por enquanto só entende texto. | Must | Mensagem de grupo não gera resposta nem registro; áudio enviado ao agente recebe o aviso e nada é guardado. | 🟡 |
| RF-07 | O sistema deve garantir que perguntas e respostas trocadas com o agente não entrem na base pesquisável. | Must | Depois de 5 perguntas, nenhuma delas aparece como evidência numa busca pelo mesmo termo. | 🟡 |
| RF-08 | O sistema deve formatar a resposta para o WhatsApp: destaques em negrito e itálico do próprio app e divisão em partes numeradas de no máximo 4.000 caracteres, sem quebrar uma citação ao meio. | Must | Resposta de 9.000 caracteres chega em 3 partes numeradas, cada uma ≤ 4.000 caracteres, com todas as citações completas. | 🟡 |
| RF-09 | O sistema deve espaçar os envios em no máximo 1 mensagem por segundo por destinatário. | Should | Uma resposta em 10 partes leva ≥ 9 s para ser entregue por completo. | 🟡 |
| RF-10 | O sistema deve reconectar após queda com espera crescente de 1 s até 60 s e não responder duas vezes à mesma pergunta quando o WhatsApp a reentregar. | Must | Com a conexão derrubada por 30 s e restaurada, a sessão volta a `connected`; uma pergunta reentregue gera uma única resposta. | 🟡 |
| RF-11 | O sistema deve expor o estado da sessão (`connected`, `reconnecting`, `logged_out`) no health check e como métrica; em `logged_out`, deve descartar as credenciais inválidas, parar de tentar e avisar o operador para parear de novo. | Must | Encerrar a sessão no celular leva o estado a `logged_out` no health check em ≤ 60 s, com aviso no log e no painel. | 🟡 |
| RF-12 | O sistema deve permitir ligar e desligar o canal WhatsApp por configuração, sem afetar a importação, o canal de teste nem as consultas. | Must | Com o canal desligado, nenhum processo conecta ao WhatsApp e os testes E2E do canal de teste continuam verdes. | 🟡 |
| RF-13 | O canal WhatsApp deve passar a mesma suíte de contrato do canal que o adaptador de teste, com o provedor simulado. | Must | A suíte de contrato roda para os dois adaptadores e passa na esteira, sem rede e sem número real. | 🟢 |
| RF-14 | O sistema deve responder a cumprimentos e pedidos de ajuda (ex.: "oi", "olá", "ajuda", "help") com uma ajuda curta: o que o agente já sabe fazer e exemplos de perguntas, sem executar busca. | Should | "oi" e "ajuda" recebem a ajuda, que tem no máximo 600 caracteres e pelo menos 2 exemplos de perguntas; a ajuda vale para qualquer canal, não só o WhatsApp. | 🟢 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Desempenho | P95 < 3 s entre a chegada da pergunta ao processo e o envio da primeira parte da resposta, sem contar a rede do WhatsApp | Spec do adaptador (P95 < 2 s até a ingestão) mais a resposta determinística atual, medida em milissegundos na S1 | 🟡 |
| Disponibilidade | Reconexão em ≤ 60 s após queda de rede; número bloqueado não derruba o restante do produto | `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#7. Requisitos Não-Funcionais` (RNF-02) e EC-01 | 🟡 |
| Recursos | ≤ 300 MB de memória no processo do canal em operação | `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#7. Requisitos Não-Funcionais` (RNF-04) | 🟡 |
| Segurança | Credenciais da sessão criptografadas em repouso com chave fora do repositório; credenciais, números de telefone e textos de mensagens nunca em logs, traces ou erros; a varredura de segredos e a análise estática sem achados críticos ou altos | `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#12. Segurança e Privacidade`; `requirements.md` (Security First) | 🟢 |
| Privacidade | Números pessoais aparecem nos logs só mascarados (ex.: `+55 11 9****-**77`) | Princípio Security First; dados de terceiros | 🟡 |
| Observabilidade | Métricas de estado da sessão, perguntas recebidas, respostas enviadas, remetentes desconhecidos e latência, com painel de observabilidade e alerta para `logged_out` | `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#13. Plano de Rollout` (monitoramento) | 🟡 |
| Arquitetura | O canal WhatsApp vive em `src/channels/` e o núcleo não importa nada dele (WhatsApp-first, not only); as regras de dependência e a complexidade ≤ 10 continuam bloqueando commit e merge | ADR-0005; `CLAUDE.md#Arquitetura` | 🟢 |
| Testabilidade | Esteira sem rede nem número real (provedor simulado); a demonstração com o chip real é manual e roteirizada no `onboarding.md` | O WhatsApp não oferece ambiente de teste para integração não oficial | 🟡 |
| Risco de bloqueio | Uso restrito ao chip secundário e a conversas com o usuário cadastrado; nenhum envio proativo | `_reversa_sdd/prd.md#8. Riscos` | 🟡 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Parear o número do agente (RF-01)
  Dado que não existe sessão guardada
  Quando o operador inicia o canal WhatsApp e lê o QR Code do terminal com o chip secundário
  Então o health check mostra a sessão "connected"

Cenário: Reiniciar sem novo pareamento (RF-02)
  Dado uma sessão pareada
  Quando o processo do canal é reiniciado
  Então a sessão volta a "connected" sem exibir QR Code
  E recriar o ambiente local também não exige novo pareamento
  E o arquivo ou registro das credenciais não contém as credenciais em texto puro

Cenário: Cadastrar o número pessoal mantendo o histórico importado (RF-03, RN-03)
  Dado o usuário com a conversa "Comunidade DevOps" importada na conta provisória
  Quando o operador cadastra o número "+55 11 98888-7777" para esse usuário
  Então a conta WhatsApp do usuário fica ativa com esse número
  E a pergunta "quem recomendou o Temporal?" continua citando a "Comunidade DevOps"

Cenário: Número já cadastrado para outro usuário (RN-07)
  Dado o número "+55 11 98888-7777" cadastrado para o usuário A
  Quando o operador tenta cadastrá-lo para o usuário B
  Então o cadastro é recusado com "este número já está cadastrado"
  E a mensagem não revela quem é o usuário A

Cenário: Perguntar pelo WhatsApp (RF-04, RN-06)
  Dado o número pessoal cadastrado e a conversa "Comunidade DevOps" importada
  Quando o usuário envia "quem recomendou o Temporal?" ao número do agente
  Então recebe na mesma conversa uma resposta que cita "Diego", "Comunidade DevOps" e a data da mensagem

Cenário: Pergunta sem evidência (RF-04, RN-06)
  Dado o número pessoal cadastrado
  Quando o usuário pergunta sobre um assunto que não existe no espaço
  Então recebe "Não encontrei evidências suficientes."

Cenário: Remetente desconhecido (RF-05, RN-02)
  Dado um número que não está cadastrado
  Quando ele envia "quem recomendou o Temporal?" ao número do agente
  Então nenhuma busca é executada
  E nenhuma mensagem é enviada a ele
  E a métrica de remetentes desconhecidos aumenta em 1

Cenário: Mensagem de grupo e mensagem que não é texto (RF-06, RN-01)
  Dado o número do agente participando de um grupo
  Quando chega uma mensagem nesse grupo
  Então nada é respondido nem guardado
  E quando o usuário cadastrado envia um áudio ao agente, recebe o aviso de que por enquanto só entende texto

Cenário: Perguntas não viram conhecimento (RF-07, RN-04)
  Dado que o usuário fez a pergunta "o que acharam do Kafka?"
  Quando ele pergunta de novo "o que acharam do Kafka?"
  Então a primeira pergunta não aparece como evidência na resposta

Cenário: Resposta longa em partes (RF-08, RF-09)
  Dado uma resposta de 9.000 caracteres com 6 citações
  Quando ela é enviada pelo WhatsApp
  Então chega em 3 partes numeradas de no máximo 4.000 caracteres cada
  E nenhuma citação é cortada
  E entre uma parte e outra passa pelo menos 1 segundo

Cenário: Queda e reentrega (RF-10)
  Dado a sessão "connected"
  Quando a conexão cai por 30 segundos e volta, e o WhatsApp reentrega a última pergunta
  Então a sessão volta a "connected"
  E a pergunta reentregue recebe uma única resposta

Cenário: Sessão encerrada no celular (RF-11)
  Dado a sessão "connected"
  Quando o operador remove o aparelho conectado no WhatsApp do chip
  Então em até 60 segundos o health check mostra "logged_out"
  E as credenciais guardadas são descartadas e o log pede um novo pareamento

Cenário: Canal desligado (RF-12)
  Dado o canal WhatsApp desligado na configuração
  Quando a aplicação sobe
  Então nenhuma conexão com o WhatsApp é aberta
  E a importação e o canal de teste funcionam normalmente

Cenário: Cumprimento ou pedido de ajuda (RF-14)
  Dado o número pessoal cadastrado
  Quando o usuário envia "oi" ao número do agente
  Então recebe a ajuda curta com exemplos de perguntas
  E nenhuma busca é executada

Cenário: Suíte de contrato (RF-13)
  Dado o provedor do WhatsApp simulado
  Quando a suíte de contrato do canal roda na esteira
  Então ela passa para o adaptador de teste e para o adaptador WhatsApp
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|---------------|
| RF-01, RF-02 | Must | Sem pareamento persistente não há canal |
| RF-03 | Must | Sem o número cadastrado o agente não sabe de quem é a pergunta |
| RF-04 | Must | É o resultado visível da fatia |
| RF-05, RF-06, RF-07 | Must | Isolamento entre espaços, nada de captura pelo número errado, perguntas fora da base |
| RF-08 | Must | O WhatsApp corta mensagens longas; citação quebrada viola "evidence over hallucination" |
| RF-09 | Should | Reduz o risco de bloqueio; as respostas atuais são curtas |
| RF-10, RF-11 | Must | Sessão instável sem aviso deixa o usuário sem resposta e sem saber por quê |
| RF-12 | Must | Rollback da fatia e esteira sem WhatsApp |
| RF-13 | Must | Garante que o adaptador é substituível (WhatsApp-first, not only) |
| RF-14 | Should | Primeira mensagem natural de quem abre a conversa; sem ela, "oi" vira "Não encontrei evidências suficientes." |
| RNF de desempenho | Should | Com a resposta determinística, a meta é folgada |
| RNF de segurança e privacidade | Must | Dados pessoais e credenciais reais pela primeira vez |

## 9. Esclarecimentos

### Sessão 2026-11-23

- **Q:** (D1) Como o número pessoal é cadastrado na S2?
  **R:** Só por comando do operador; o código de verificação pelo WhatsApp fica para a S5. Reflexo: RF-03.
- **Q:** (D2) O que o número do agente faz quando um número desconhecido escreve?
  **R:** Fica em silêncio e só conta numa métrica. Reflexo: RF-05 e cenário "Remetente desconhecido".
- **Q:** Onde ficam as credenciais criptografadas da sessão do chip?
  **R:** Num arquivo local criptografado, fora do banco: sobrevivem à recriação do ambiente e não exigem novo pareamento. Reflexo: RF-02 e cenário "Reiniciar sem novo pareamento".
- **Q:** O que o agente responde a "oi", "ajuda" ou algo que não é pergunta?
  **R:** Uma ajuda curta, com exemplos de perguntas e o que ele já sabe fazer. Reflexo: novo RF-14 e cenário "Cumprimento ou pedido de ajuda".

## 10. Lacunas

Nenhuma lacuna aberta.

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-23 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-11-23 | `/reversa-clarify`: D1 e D2 resolvidas, credenciais em arquivo local (RF-02), novo RF-14 (ajuda) | reversa |
