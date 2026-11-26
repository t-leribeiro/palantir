# Requirements: Guardar um conteúdo com tema e recuperar pelo tema (fatia S8)

> Identificador: `009-guardar-por-tema`
> Data: `2026-11-25`
> Pasta da extração reversa: `_reversa_sdd/` (greenfield: `prd.md`, specs em `sdd/` e adendos 001 a 008, mais os de bug)
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

Hoje o Palantír só conhece o que vem das conversas importadas ou acompanhadas. Um conteúdo solto que o dono quer guardar não tem para onde ir: um texto, um link ou um trecho que alguém mandou em outro lugar. Pior: se ele encaminha uma mensagem ao agente, ela é tratada como pergunta e volta como "não encontrei". Com esta fatia, o dono encaminha o conteúdo ao agente e pede "guarda isso em arquitetura". O agente confirma "Guardei em arquitetura". Depois, "o que guardei sobre arquitetura?" devolve os itens daquele tema, com a origem de cada um. Isso fecha o comportamento "Guardar" do PRD e o critério de aceite P1 (guardar).

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/prd.md#4. Escopo (in)` | "Guardar: encaminhar texto, link ou áudio ao agente e classificá-lo em um tema"; separação entre evidência (`Message`) e conhecimento derivado (`KnowledgeItem` + `EvidenceReference`) | 🟡 |
| `_reversa_sdd/prd.md#9. Critérios de aceite (alto nível)` | P1 (guardar): "guarda isso em <tema>" deixa o conteúdo recuperável por esse tema | 🟡 |
| `_reversa_sdd/personas.md#Persona 1: Profissional conectado` | Jornada 7: encaminhar um conteúdo ao agente e pedir para guardar com um tema | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#6. Requisitos Funcionais` | RF-05: `KnowledgeItem` `saved` com tema, nota opcional e `EvidenceReference`. RF-06: tema normalizado e reaproveitado. RF-07: item sem evidência é recusado. RF-09: a exclusão em cascata remove itens | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#6.3 Fluxos Alternativos` | Fluxo A: o conteúdo guardado é indexado numa fonte especial "Guardados" do espaço | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#8. Design e Interface` | Textos: "Guardei em <tema>." e "Você ainda não guardou nada sobre este tema." | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#9. Modelo de Dados` | `KnowledgeItem`, `EvidenceReference` e `Theme` (`name`, `normalized`) por `space_id` | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#11. Edge Cases e Tratamento de Erros` | EC-03: "guarda isso" sem tema faz o agente perguntar o tema; sem resposta em 10 min, vai para "sem tema". EC-04: texto acima de 50.000 caracteres é indexado até esse limite | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#4. Non-Goals (Fora do Escopo)` | NG-02: na v0.1 só há os temas que o usuário dá ao guardar, sem classificar todas as mensagens | 🟡 |
| `_reversa_sdd/sdd/conversational-agent.md#6. Requisitos Funcionais` | RF-07: guardar conteúdo encaminhado com tema e confirmar com o tema | 🟡 |
| `_reversa_sdd/sdd/conversational-agent.md#14. Open Questions` | OQ-02: áudio mandado ao agente é pergunta ou conteúdo a guardar? Ficou para a S8 (RN-09 da 005) | 🟡 |
| `_reversa_sdd/sdd/channel-contract.md#6. Requisitos Funcionais` | RF-09: `CanonicalMessage` já prevê `isForwarded` e `quotedExternalMessageId`; `captureMethod` já tem `forwarded_to_agent` | 🟡 |
| `_reversa_sdd/addenda/003-perguntar-pelo-whatsapp.md#Impacto por artefato da extração` | Perguntas e respostas ao agente não entram na base pesquisável. Mídia recebe o aviso de "só texto" | 🟢 |
| `_reversa_sdd/addenda/005-perguntar-sobre-audios.md#Impacto por artefato da extração` | Só áudio é guardado, cifrado, pelo job `media.process`, e transcrito localmente. Ao agente, o áudio ainda não é baixado | 🟢 |
| `_reversa_sdd/addenda/006-gerenciar-grupos-pelo-agente.md#Impacto por artefato da extração` | Comandos por palavras fixas no núcleo do agente, sem LLM; estado curto em `agent_conversation_state`; auditoria sem conteúdo; exclusão em cascata pela fonte | 🟢 |
| `_reversa_sdd/addenda/007-achar-assunto-outras-palavras.md#Impacto por artefato da extração` | Toda mensagem indexada fica pesquisável por palavra, palavra parecida e sentido, com a mesma citação | 🟢 |
| `_reversa_sdd/addenda/008-mostrar-original-com-contexto.md#Impacto por artefato da extração` | Toda resposta com citações vale para "mostra a N" por 2 h | 🟢 |

Componentes tocados:
- `agent`: o comando "guarda", a listagem por tema e o tratamento do conteúdo encaminhado;
- `knowledge`: os itens guardados, os temas e a indexação;
- `ingestion` e `identity-and-sources`: a fonte "Guardados" do espaço;
- `media`, para guardar e transcrever o áudio mandado ao agente;
- o contrato do canal, para a marca de encaminhado;
- o adaptador WhatsApp, que hoje manda sempre `isForwarded: false`, não informa a mensagem citada nem a legenda de mídia e não baixa o áudio mandado ao agente.

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| P1, profissional conectado (o dono) | Guardar um conteúdo útil que viu num grupo não acompanhado ou num contato | Encaminha ao agente uma mensagem com a recomendação de uma ferramenta e manda "guarda isso em arquitetura" |
| P1, anotando uma ideia | Guardar um link ou uma anotação própria sem encaminhar nada | Manda "guarda em leituras: https://… artigo sobre filas" numa mensagem só |
| P1, recuperando | Achar depois o que guardou | Manda "o que guardei sobre arquitetura?" e recebe os itens numerados, com quando foram guardados; "mostra a 2" abre o item inteiro |
| P2, gestor com pouco tempo | Guardar um insight relevante na própria memória | Encaminha o resumo que alguém fez num grupo e guarda em "decisões do projeto X" |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** Guardar exige o pedido explícito do dono, com o tema. 🟢
   - O pedido é reconhecido por palavras fixas, sem LLM, como os comandos da S5: "guarda isso em <tema>", "guarda em <tema>" e "guardar em <tema>", sem acento nem maiúsculas.
   - Ele se liga ao conteúdo de três jeitos (escolha do dono em 2026-11-26):
     - **resposta citando:** o dono responde (cita) uma mensagem encaminhada com "guarda em X", e só ela é guardada. Quando há citação, ela tem prioridade;
     - **últimos 10 minutos:** sem citação, "guarda em X" guarda tudo o que o dono encaminhou nos últimos 10 minutos e ainda não foi guardado, até 20 mensagens, na ordem em que chegaram;
     - **numa mensagem só:** "guarda em X: <texto>" guarda o texto depois dos dois-pontos.
   - "guarda em X" sem citação, sem nada encaminhado nos últimos 10 minutos e sem texto responde que não há o que guardar.
   - Tipo: nova.
   - Origem: `conversational-agent.md` RF-07; `addenda/006` (palavras fixas).
2. **RN-02:** O conteúdo encaminhado ao agente deixa de ser tratado como pergunta. 🟢
   - O adaptador marca a mensagem como encaminhada (`isForwarded`) e informa a mensagem citada (`quotedExternalMessageId`), pelo que o WhatsApp manda.
   - O agente nunca busca nem responde "não encontrei" a um conteúdo encaminhado.
   - O primeiro encaminhado de uma leva recebe um aviso, uma vez só: "Recebi. Para guardar, mande 'guarda em <tema>'". Uma leva é o que chega enquanto houver encaminhado esperando pedido. Os seguintes da mesma leva não recebem nada.
   - O encaminhado sem pedido em 10 minutos é descartado sem deixar rastro: nem texto, nem mídia, nem registro do que era.
   - Tipo: alterada (hoje, todo texto do dono é pergunta).
   - Origem: `channel-contract.md` RF-09; `addenda/003`.
3. **RN-03:** O tema é texto livre do dono, com até 60 caracteres. 🟡
   - Ele é normalizado: minúsculas, sem acento e com os espaços colapsados.
   - Um tema equivalente que já existe é reaproveitado, e o nome mostrado é o da primeira vez.
   - "Arquitetura de Software" e "arquitetura de software" são o mesmo tema. "arquitetura" e "arquitetura de software" são temas diferentes.
   - Tipo: nova.
   - Origem: `knowledge-indexing.md` RF-06.
4. **RN-04:** "guarda isso" sem tema faz o agente perguntar o tema. 🟡
   - A próxima mensagem do dono em até 10 minutos é o tema.
   - Sem resposta nesse prazo, o conteúdo vai para o tema "sem tema", e o agente avisa na próxima interação.
   - Tipo: nova.
   - Origem: `knowledge-indexing.md` EC-03.
5. **RN-05:** Todo item guardado aponta para pelo menos uma mensagem guardada (`EvidenceReference`). 🟡
   - A mensagem é evidência imutável, numa fonte "Guardados" do espaço do dono, com o método de captura `forwarded_to_agent`.
   - Não há item guardado sem mensagem.
   - Tipo: nova.
   - Origem: `knowledge-indexing.md` RF-05, RF-07 e Fluxo A; `ingestion.md` RF-05.
6. **RN-06:** Quem aparece como autor é sempre o dono ("você guardou"), com a data em que guardou. 🟡
   - O WhatsApp não informa quem escreveu a mensagem original encaminhada nem quando.
   - A citação nunca inventa autor nem data originais.
   - Tipo: nova.
   - Origem: princípio "Evidence over hallucination".
7. **RN-07:** Guardar o mesmo conteúdo de novo no mesmo tema não duplica. O agente responde "já estava guardado em <tema>". Mesmo conteúdo quer dizer o mesmo texto normalizado. O mesmo conteúdo pode estar em temas diferentes. 🟡
   - Tipo: nova.
8. **RN-08:** O que é guardado fica pesquisável como qualquer mensagem, por palavra, palavra parecida e sentido. Ele entra também nas respostas às perguntas normais, junto com as mensagens das conversas (escolha do dono em 2026-11-26). 🟢
   - A citação mostra "Guardados · <tema>" no lugar da conversa.
   - Uma pergunta que cita o nome de uma conversa (RN-11 da S5) continua buscando só nela.
   - Tipo: nova.
   - Origem: `addenda/007`.
9. **RN-09:** "o que guardei sobre <tema>?" lista o tema inteiro, sem buscar dentro do conteúdo. O nome do tema é comparado já normalizado (RN-03). A listagem mostra os itens do mais recente ao mais antigo, numerados. 🟢
   - Cada item traz até 280 caracteres e a data em que foi guardado.
   - A listagem vale para "mostra a N" por 2 h, como uma resposta com citações.
   - Tema sem itens responde "Você ainda não guardou nada sobre <tema>".
   - Tipo: nova.
   - Origem: `knowledge-indexing.md` §8; `addenda/008`.
10. **RN-10:** Um item guardado sai da base quando o dono o apaga. 🟡
    - Apagar a fonte "Guardados" apaga todos os itens, os temas sem itens e a mídia, pela mesma cascata da S5.
    - Tipo: nova.
    - Origem: `identity-and-sources.md` RF-07; `knowledge-indexing.md` RF-09; `addenda/006`.
11. **RN-11:** Tipos que podem ser guardados (escolha do dono em 2026-11-26): 🟢
    - **texto e link:** o texto inteiro, com os links como estão. O agente não abre o link;
    - **áudio:** o arquivo é guardado cifrado e transcrito no computador do dono, pelo caminho da S4 (`media.process`), e fica pesquisável pelo que foi falado. Vale para áudio encaminhado e para áudio gravado pelo próprio dono ao agente. Áudio mandado ao agente nunca é pergunta: isso fecha a OQ-02. Sem o armazenamento de mídia configurado, o agente avisa que não consegue guardar áudio;
    - **foto, vídeo e documento:** só a legenda é guardada, e o arquivo não, como hoje. Sem legenda, o agente avisa que não há texto para guardar;
    - **figurinha e outros tipos:** não são guardados, e o agente avisa.
    - Tipo: nova; substitui o aviso de "só texto" para conteúdo ao agente.
    - Origem: `prd.md` §4 ("texto, link ou áudio"); `conversational-agent.md` OQ-02; `addenda/005`.
12. **RN-12:** Nada do conteúdo guardado, do tema ou do texto do pedido vai para log, métrica ou trace. 🟢
    - O tema conta como conteúdo, porque pode ter nomes de pessoas ou de clientes.
    - A auditoria registra a criação e a exclusão de itens sem o conteúdo e sem o tema.
    - Tipo: nova.
    - Origem: `knowledge-indexing.md` §12; privacidade das S2 a S7.

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | O adaptador WhatsApp informa no `CanonicalMessage` se a mensagem direta ao agente foi encaminhada (`isForwarded`), qual mensagem ela cita (`quotedExternalMessageId`) e a legenda de foto, vídeo e documento. O canal de teste aceita as mesmas informações | Must | Uma mensagem encaminhada pelo WhatsApp simulado chega ao agente com `isForwarded: true`; uma digitada chega com `false`; uma resposta citando chega com o id da citada | 🟡 |
| RF-02 | O agente reconhece o pedido de guardar (RN-01) e o tema, antes da busca e sem LLM | Must | "Guarda isso em Arquitetura" é reconhecido com o tema "Arquitetura"; "como guardar senhas?" continua sendo pergunta | 🟡 |
| RF-03 | Guardar cria, no espaço do dono, a mensagem na fonte "Guardados", o item com o tema e a referência de evidência, numa transação, e dispara a indexação (RN-05) | Must | Depois de guardar, existe 1 item com o tema e 1 referência para a mensagem, e a mensagem aparece na busca em até 60 s | 🟡 |
| RF-04 | O agente confirma com o nome do tema ("Guardei em arquitetura") ou avisa a duplicata (RN-07) | Must | Guardar duas vezes o mesmo texto no mesmo tema deixa 1 item e responde "já estava guardado" | 🟡 |
| RF-05 | Temas normalizados e reaproveitados (RN-03) | Must | Guardar em "Arquitetura de Software" e depois em "arquitetura de software" deixa 1 tema com 2 itens | 🟡 |
| RF-06 | "guarda isso" sem tema pergunta o tema e espera 10 min (RN-04) | Should | Sem resposta em 10 min, o item fica em "sem tema" | 🟡 |
| RF-07 | "o que guardei sobre <tema>?" e "guardados <tema>" listam os itens do tema (RN-09). "temas" lista os temas com a quantidade de itens | Must | Com 3 itens em "arquitetura", a listagem traz os 3, numerados, do mais recente ao mais antigo; "mostra a 1" abre o mais recente | 🟡 |
| RF-08 | O conteúdo encaminhado nunca vira pergunta: o primeiro da leva recebe o aviso, e sem pedido em 10 min é descartado sem rastro (RN-02) | Must | Encaminhar 3 textos seguidos não chama a busca, gera 1 aviso e, 10 min depois, nada deles existe no banco | 🟢 |
| RF-13 | O pedido se liga ao conteúdo pela citação, pelos últimos 10 minutos (até 20) ou pela mensagem só (RN-01) | Must | Com 3 encaminhados pendentes, responder citando o 2º guarda só ele; "guarda em X" sem citação guarda os outros 2 | 🟢 |
| RF-14 | Áudio encaminhado ou gravado ao agente é guardado cifrado e transcrito pelo caminho da S4, e fica pesquisável pelo que foi falado (RN-11) | Must | Um áudio guardado em "reuniões" aparece na busca pela palavra falada depois da transcrição e na listagem do tema com a duração | 🟢 |
| RF-15 | Foto, vídeo e documento guardam só a legenda; sem legenda ou de tipo não aceito, o agente avisa (RN-11) | Should | Uma foto com legenda guarda a legenda e nenhum arquivo; uma foto sem legenda recebe o aviso | 🟢 |
| RF-09 | O dono apaga um item guardado da última listagem ("esquece a 2") com confirmação, como o "apagar" da S5 | Should | Depois de confirmar, o item, a mensagem e o trecho indexado somem da busca | 🟡 |
| RF-10 | A ajuda do agente ganha "guarda em <tema>" e "guardados <tema>", dentro do limite de 600 caracteres | Should | "ajuda" mostra os dois comandos com exemplo | 🟢 |
| RF-11 | Métricas sem conteúdo: pedidos de guardar por resultado (`saved`, `duplicate`, `asked_theme`, `no_content`) e por tipo, e listagens por resultado (`listed`, `empty`) | Should | O painel mostra as contagens; nenhuma métrica tem o tema como rótulo | 🟡 |
| RF-12 | O mesmo comportamento pelo canal de teste e pelo WhatsApp, pelo `AgentReply` neutro | Must | A suíte de contrato cobre guardar e listar nos dois adaptadores | 🟢 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Desempenho | P95 abaixo de 1 s do pedido à confirmação, sem contar o envio pelo canal. A indexação segue assíncrona, em até 60 s | Sem LLM; a indexação usa o job `knowledge.index` da S6 | 🟡 |
| Segurança | O espaço sempre vem da conta verificada. Só conta ativa guarda. A fonte "Guardados" pertence ao espaço do dono e nunca aparece para outra conta | `conversational-agent.md` §12; `addenda/006` | 🟢 |
| Privacidade | Logs, métricas e traces sem conteúdo, tema ou nomes (RN-12). O encaminhado descartado não deixa rastro (RN-02). O conteúdo guardado fica só na máquina do dono, como o resto da base | Padrão das S2 a S7; `knowledge-indexing.md` §12 | 🟢 |
| Dados de terceiros | Conteúdo encaminhado pode ser de terceiros de grupos não acompanhados. Guardar é ato explícito do dono, para uso pessoal, e nada sai da máquina. Um verificador externo ligado (ADR-0013) recebe o guardado como qualquer candidata | ADR-0011; ADR-0013 | 🟡 |
| Observabilidade | Span e métricas de guardar e listar, com o resultado | `platform-foundation` (painéis por fatia) | 🟡 |
| Arquitetura | O núcleo não conhece o canal. A marca de encaminhado já existe no contrato (`isForwarded`); se nada mudar no esquema, o contrato não muda de versão | ADR-0004; contrato 1.4.0 | 🟢 |
| Limites | Texto guardado indexado até 50.000 caracteres, com o truncamento registrado sem conteúdo | `knowledge-indexing.md` EC-04 | 🟡 |

## 7. Critérios de Aceitação

```gherkin
Cenário: guardar um conteúdo encaminhado com tema
  Dado uma conta verificada
  Quando o dono encaminha ao agente uma mensagem de texto
  E pede "guarda isso em Arquitetura"
  Então o agente responde "Guardei em Arquitetura"
  E o conteúdo fica na fonte "Guardados" do espaço dele, com o tema "arquitetura"

Cenário: guardar numa mensagem só
  Dado uma conta verificada
  Quando o dono manda "guarda em leituras: https://exemplo.com/filas artigo sobre filas"
  Então o agente responde "Guardei em leituras"
  E o texto depois dos dois-pontos é o conteúdo guardado

Cenário: recuperar pelo tema
  Dado que o dono guardou 3 conteúdos em "arquitetura"
  Quando ele pergunta "o que guardei sobre arquitetura?"
  Então recebe os 3 itens numerados, do mais recente ao mais antigo, com a data em que guardou
  E "mostra a 1" abre o item mais recente inteiro

Cenário: mesmo tema escrito de outro jeito
  Dado que o dono guardou um conteúdo em "Arquitetura de Software"
  Quando ele guarda outro em "arquitetura de software"
  Então os dois ficam no mesmo tema

Cenário: guardar o mesmo conteúdo duas vezes
  Dado que um texto já está guardado em "arquitetura"
  Quando o dono guarda o mesmo texto em "arquitetura"
  Então o agente responde que já estava guardado
  E continua existindo 1 item

Cenário: guardar sem tema
  Dado que o dono encaminhou um conteúdo
  Quando ele manda "guarda isso"
  Então o agente pergunta em qual tema
  E se ele não responder em 10 minutos, o conteúdo vai para "sem tema"

Cenário: encaminhado não vira pergunta
  Dado uma conta verificada
  Quando o dono encaminha ao agente 3 mensagens de texto seguidas, sem pedir nada
  Então o agente não busca e não responde "não encontrei"
  E manda um único aviso de como guardar
  E 10 minutos depois nada dessas mensagens existe na base

Cenário: guardar respondendo citando
  Dado que o dono encaminhou 3 mensagens nos últimos 10 minutos
  Quando ele responde citando a 2ª com "guarda em decisões"
  Então só a 2ª é guardada em "decisões"
  E as outras 2 continuam esperando pedido

Cenário: guardar o que foi encaminhado nos últimos 10 minutos
  Dado que o dono encaminhou 2 mensagens nos últimos 10 minutos
  Quando ele manda "guarda em decisões", sem citar
  Então as 2 são guardadas em "decisões"

Cenário: nada para guardar
  Dado que o dono não encaminhou nada nos últimos 10 minutos
  Quando ele manda "guarda em decisões", sem citar e sem texto
  Então o agente responde que não há o que guardar

Cenário: guardar um áudio
  Dado que o armazenamento de mídia está configurado
  Quando o dono encaminha um áudio ao agente e manda "guarda em reuniões"
  Então o áudio é guardado cifrado e transcrito no computador do dono
  E depois da transcrição aparece na busca pelo que foi falado

Cenário: foto sem legenda
  Dado uma conta verificada
  Quando o dono encaminha uma foto sem legenda e manda "guarda em viagens"
  Então o agente avisa que não há texto para guardar nessa foto e nada é guardado

Cenário: guardado aparece na resposta normal
  Dado que o dono guardou em "arquitetura" um texto sobre o Temporal
  Quando ele pergunta "quem falou do Temporal?"
  Então a resposta pode citar o guardado como "Guardados · arquitetura"

Cenário: tema vazio
  Dado que o dono nunca guardou nada em "finanças"
  Quando ele pergunta "o que guardei sobre finanças?"
  Então o agente responde "Você ainda não guardou nada sobre finanças"

Cenário: pergunta parecida com o comando
  Dado uma conta verificada
  Quando o dono pergunta "como guardar senhas no cofre?"
  Então o agente trata como pergunta e busca, sem guardar nada

Cenário: guardar sem conta verificada
  Dado uma conta pendente de verificação
  Quando ela manda "guarda em arquitetura: texto"
  Então o agente pede o código de verificação e nada é guardado

Cenário: apagar um item guardado
  Dado que a última listagem de "arquitetura" tem 3 itens
  Quando o dono manda "esquece a 2" e confirma
  Então o item 2, a mensagem dele e o trecho indexado somem da busca

Cenário: nada do conteúdo nos logs
  Dado que o dono guardou um texto com um nome de pessoa em um tema com o nome de um cliente
  Quando os logs, as métricas e os traces da operação são inspecionados
  Então nenhum deles contém o texto, o nome nem o tema
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|---------------|
| RF-01 a RF-05, RF-07, RF-08, RF-12, RF-13 | Must | São o "Guardar" do PRD e o critério de aceite P1 (guardar) |
| RF-14 (áudio) | Must | Escolha do dono em 2026-11-26; o PRD fala em "texto, link ou áudio" |
| RF-15 (legenda de foto, vídeo e documento) | Should | Escolha do dono em 2026-11-26; o arquivo em si continua sem ser guardado |
| RF-06 (sem tema) | Should | Previsto no EC-03 da spec; o caso comum traz o tema |
| RF-09 (apagar um item) | Should | Sem ele, o único jeito de tirar um item é apagar todos os guardados |
| RF-10, RF-11 | Should | Descoberta do comando e acompanhamento, sem bloquear a entrega |
| Guardar o arquivo de foto, vídeo e documento | Won't (S8) | Hoje só áudio é guardado (`PALANTIR_MEDIA_STORE_KINDS`); ligar outros tipos é decisão futura |
| Classificar sozinho o tema, sugerir tema parecido, renomear ou juntar temas | Won't (S8) | NG-02 da spec: na v0.1 o tema é dado pelo dono |
| Abrir o link e guardar o conteúdo da página | Won't (S8) | Seria uma chamada de rede para fora a cada link guardado, e o resumo do conteúdo é da S9 |
| Resumo de um tema | Won't (S8) | É a S9 |

## 9. Esclarecimentos

### Sessão 2026-11-26

- **Q:** O WhatsApp entrega o conteúdo encaminhado e o "guarda em X" como duas mensagens. Como o pedido se liga ao conteúdo?
  **R:** As duas formas: responder citando a mensagem encaminhada (tem prioridade) e, sem citação, tudo o que foi encaminhado nos últimos 10 minutos e ainda não guardado, até 20 mensagens. "guarda em X: <texto>" numa mensagem só também vale. Aplicado em RN-01 e RF-13.
- **Q:** O que o agente faz quando chega conteúdo encaminhado sem pedido?
  **R:** Avisa uma vez por leva ("Recebi. Para guardar, mande 'guarda em <tema>'"). Sem pedido em 10 minutos, o conteúdo é descartado sem deixar rastro. Aplicado em RN-02 e RF-08.
- **Q:** Quais tipos de conteúdo podem ser guardados?
  **R:** Texto, link e áudio. O áudio é guardado cifrado e transcrito pelo caminho da S4. Foto, vídeo e documento guardam só a legenda, sem o arquivo. Aplicado em RN-11, RF-14 e RF-15. Fecha a OQ-02 do `conversational-agent`: áudio mandado ao agente é conteúdo a guardar, nunca pergunta.
- **Q:** Onde o conteúdo guardado aparece?
  **R:** Nas respostas às perguntas normais, citado como "Guardados · <tema>", e na listagem. "O que guardei sobre <tema>?" lista o tema inteiro, sem buscar dentro do conteúdo. Aplicado em RN-08 e RN-09.

### Sessão 2026-11-26 (demonstração com o chip)

- **Q:** Na demonstração, a foto encaminhada foi guardada, mas links e anotações encaminhados viraram perguntas. O WhatsApp não marca como encaminhada a mensagem que o próprio dono escreveu. Como o agente reconhece esse conteúdo?
  **R:** Leva e citação. Textos comuns que chegam juntos (até 2 s pela hora da mensagem) formam uma leva, que espera o pedido com um aviso só. Responder citando qualquer mensagem dos últimos 10 minutos com "guarda em X" guarda essa mensagem, mesmo que ela tenha virado pergunta ou já tenha sido guardada em outro tema. Depois dos 10 minutos, a citada é procurada entre os guardados e copiada para o tema novo (T026). Tudo só na memória (adendo do ADR-0014). Ações T024 e T025.

## 10. Lacunas

Nenhuma lacuna aberta. As três dúvidas da versão inicial foram resolvidas na sessão de 2026-11-26.

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-25 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-11-26 | Demonstração: leva de textos do dono e citação de texto recente (T024, T025) | reversa |
| 2026-11-26 | `/reversa-clarify`: 4 respostas (ligação do pedido, encaminhado sem pedido, tipos, onde aparece); RN-01, RN-02, RN-08, RN-09 reescritas, RN-11 nova, RF-13 a RF-15 novos | reversa |
