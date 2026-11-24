# Requirements: Perguntar sobre o que foi dito em áudios (fatia S4)

> Identificador: `005-perguntar-sobre-audios`
> Data: `2026-11-23`
> Pasta da extração reversa: `_reversa_sdd/` (greenfield: `prd.md`, specs em `sdd/` e adendos 001 a 004, mais os de bug)
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

O usuário pergunta ao agente, pelo WhatsApp, "em qual áudio alguém falou de X?". A resposta aponta o áudio certo: quem mandou, em qual conversa, quando e em que ponto do áudio a palavra aparece, com o trecho transcrito. Vale para áudios que vieram na importação de uma conversa exportada (S1) e para áudios mandados num grupo autorizado (S3).

Hoje os áudios são só contados e descartados, então o que foi falado não existe na memória. Esta é a pergunta que originou o projeto. A transcrição roda na máquina do usuário, sem custo e sem mandar áudio para fora. O áudio original é guardado para poder ser transcrito de novo com um modelo melhor.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/prd.md#9. Critérios de aceite (alto nível)` | P1 (áudio): perguntar em qual áudio uma palavra foi mencionada; o agente identifica a mensagem de áudio e oferece o trecho | 🟡 |
| `_reversa_sdd/prd.md#8. Riscos` | Transcrição em português pode não bastar para busca por palavra: medir e manter o áudio original para reprocessar; priorizar execução local por custo | 🟡 |
| `_reversa_sdd/sdd/media-transcription.md#6. Requisitos Funcionais` | RF-01 gravar no object storage com chave por espaço, fonte, mensagem e anexo; RF-02 SHA-256 para não duplicar; RF-03 job `media.transcribe` para `audio/*`; RF-04 pt-BR com detecção de idioma; RF-05 transcrição com segmentos (`start_s`, `end_s`); RF-06 indexar depois; RF-08 recusar acima de 60 min; RF-07 e RF-09 (retranscrever, URL temporária) como Should | 🟡 |
| `_reversa_sdd/sdd/media-transcription.md#7. Requisitos Não-Funcionais` | RNF-01 fator de tempo real ≤ 0,5; RNF-02 execução local por padrão; RNF-03 objetos criptografados em repouso, bucket privado | 🟡 |
| `_reversa_sdd/sdd/media-transcription.md#11. Edge Cases e Tratamento de Erros` | EC-01 arquivo corrompido, EC-02 falha ou timeout do motor (3 tentativas), EC-03 backlog da importação com prioridade para o ao vivo, EC-04 áudio longo demais | 🟡 |
| `_reversa_sdd/sdd/media-transcription.md#14. Open Questions` | OQ-01 qual modelo local cabe no hardware com WER ≤ 20%; OQ-02 se 20% basta para nomes técnicos | 🟡 |
| `_reversa_sdd/sdd/whatsapp-export-importer.md#6. Requisitos Funcionais` | RF-03 vincular a referência do anexo no texto (`PTT-...opus (arquivo anexado)`) ao arquivo do ZIP; RF-09 relatório com mídias vinculadas e ausentes | 🟡 |
| `_reversa_sdd/sdd/whatsapp-export-importer.md#11. Edge Cases e Tratamento de Erros` | EC-02 mídia ausente no ZIP: mensagem importada com anexo `unavailable` e contada | 🟡 |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#6. Requisitos Funcionais` | RF-04 áudio de conversa autorizada vira `CanonicalMessage`; RF-06 baixar a mídia via `fetchMedia` e entregar ao storage; RF-05 nunca baixar mídia de conversa não autorizada | 🟡 |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#11. Edge Cases e Tratamento de Erros` | EC-02 falha no download: 3 tentativas com backoff, depois anexo `unavailable` | 🟡 |
| `_reversa_sdd/sdd/channel-contract.md#6. Requisitos Funcionais` | RF-01 `fetchMedia` na interface do canal; RF-06 capacidade `supportsMedia`; RF-07 suíte de contrato cobre mídia | 🟡 |
| `_reversa_sdd/sdd/ingestion.md#6. Requisitos Funcionais` | RF-07 jobs seguintes na mesma transação da gravação (outbox): `media.store` para anexos e `knowledge.index` para a mensagem | 🟡 |
| `_reversa_sdd/sdd/knowledge-indexing.md#6. Requisitos Funcionais` | RF-01 o texto indexável inclui a transcrição ativa; trechos guardam a faixa de tempo do áudio (`audio_start_s`, `audio_end_s`, seção 9) | 🟡 |
| `_reversa_sdd/sdd/retrieval.md#6. Requisitos Funcionais` | RF-05 resultado devolve o tipo e a faixa de tempo do áudio quando houver | 🟡 |
| `_reversa_sdd/sdd/conversational-agent.md#14. Open Questions` | OQ-02 áudio mandado ao agente: pergunta ou conteúdo a guardar? Continua aberta (S8) | 🟡 |
| `_reversa_sdd/addenda/002-perguntar-historico-importado.md#Impacto por artefato da extração` | Importação só de textos; mídias contadas para a S4; chave determinística da mensagem importada | 🟢 |
| `_reversa_sdd/addenda/bug-BUG-20261123-S57G-v001.md#Delta` | A legenda de anexo virou mensagem de texto, e a S4 vincula o arquivo a essa mesma mensagem | 🟢 |
| `_reversa_sdd/addenda/004-captura-ao-vivo-grupo-teste.md#Impacto por artefato da extração` | Captura ao vivo só de texto; mídia contada por tipo e descartada sem download; reconciliação ao vivo × importada por texto e até 60 s | 🟢 |
| `docs/adr/0006-iac-local-com-terraform-e-docker.md` | Object storage local compatível com S3 (SeaweedFS no lugar do MinIO), bucket privado `palantir-media`, já provisionado e ainda sem uso | 🟢 |
| `docs/plano-de-fatias.md#Status` | S4: "Em qual áudio alguém falou de X?" devolve o áudio certo, importado ou ao vivo; decisão pendente: modelo de transcrição local, com medição | 🟢 |

Ambiente medido em 2026-11-23, sem ler conteúdo:
- **Máquina de desenvolvimento:** Intel Core Ultra 7 165U, 14 threads, 31 GB de RAM, sem GPU dedicada. A transcrição roda em CPU.
- **Export real "T3"** (só local, em `exports/`): 158 áudios `.opus`, cerca de 31 MB.
- **Os outros dois exports reais:** não têm áudio.

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| P1, Profissional conectado (`_reversa_sdd/personas.md#Persona 1`) | Reencontrar algo que alguém falou num áudio, sem ouvir um por um | Lembra que alguém explicou "Temporal" num áudio do grupo semanas atrás. Pergunta ao agente e recebe quem falou, quando e em que minuto do áudio |
| P1, no dia a dia | Achar também o áudio de hoje | Um colega manda um áudio no grupo autorizado de manhã. À tarde, a pergunta já encontra o que foi falado |
| Operador (hoje, o próprio usuário) | Importar o histórico com áudios e escolher o modelo de transcrição com números, não no chute | Importa o export com mídias, acompanha a fila de transcrição no painel e compara os modelos candidatos num comando de medição |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** Só áudio de fonte autorizada é baixado, guardado e transcrito. Áudio de grupo não autorizado, ou anterior à autorização, continua descartado sem download, como na S3. 🟢
   - Origem: `_reversa_sdd/addenda/004-captura-ao-vivo-grupo-teste.md` (RF-05 do adaptador)
   - Tipo: alterada (o áudio de grupo autorizado deixa de ser descartado)
2. **RN-02:** A mensagem de áudio vira conhecimento com autor, conversa e data, como uma mensagem de texto. O arquivo original fica guardado num armazenamento privado, separado por espaço. Com o motor local padrão, ele nunca sai da máquina. 🟢
   - Origem: `_reversa_sdd/sdd/media-transcription.md#6. Requisitos Funcionais` (RF-01), `#12. Segurança e Privacidade`
   - Tipo: nova
3. **RN-03:** A transcrição é derivada do áudio, nunca substitui a mensagem. Ela registra o motor, o modelo e a versão. Uma nova transcrição do mesmo áudio cria uma versão nova, uma delas fica ativa, e a anterior não é apagada.

   O motor de transcrição é substituível. Ele fica atrás de uma interface própria, e a configuração escolhe a implementação. O padrão é o Whisper local. Trocar o modelo do Whisper, trocar de motor local ou usar no futuro um serviço de transcrição externo (SaaS) não pode exigir mudança fora do adaptador novo e da configuração.

   Um serviço externo só entra por escolha explícita do usuário, porque manda o áudio para fora da máquina. Nesta fatia só existe o adaptador local. 🟢
   - Origem: `_reversa_sdd/sdd/media-transcription.md#15. Decisões Tomadas` (versões de transcrição), `#8. Design e Interface` (interface `Transcriber`), `#7` RNF-02 (provedor pago só por configuração explícita), `#3. Goals` (G-03, G-04); esclarecimento de 2026-11-23
   - Tipo: nova
4. **RN-04:** O mesmo áudio que chega pela captura e pela importação fica com um registro e um arquivo. O casamento usa a mesma fonte, a diferença de até 60 s e o mesmo conteúdo do arquivo (hash SHA-256), já que áudio não tem texto para comparar. 🟡
   - Origem: `_reversa_sdd/sdd/media-transcription.md#6. Requisitos Funcionais` (RF-02); reconciliação da S3 (`addenda/004-*`)
   - Tipo: alterada (a reconciliação ganha um critério para áudio)
5. **RN-05:** A resposta identifica a evidência como áudio. Ela mostra o autor, a conversa, a data, a duração do áudio, o ponto (minuto e segundo) em que o trecho começa e o próprio trecho transcrito. A citação de áudio entra no limite de 3 citações por resposta. 🟡
   - Origem: `_reversa_sdd/prd.md#9` (P1 áudio), `_reversa_sdd/sdd/retrieval.md#6` (RF-05)
   - Tipo: alterada (a resposta da S2 ganha o formato de áudio). A resposta é só texto; devolver o arquivo do áudio na conversa fica para a S7 ("mostra a 2"), por decisão de 2026-11-23.
   - Confidência: 🟢
6. **RN-06:** Os casos que não viram texto pesquisável ficam com o motivo registrado:
   - áudio acima de 60 min: `too_long`, não é transcrito;
   - arquivo que não decodifica: `failed`, motivo `corrupted`, sem nova tentativa;
   - falha ou demora do motor: até 3 tentativas, depois `failed`;
   - áudio sem fala reconhecível: transcrição vazia, que não é indexada.

   Em todos os casos o áudio fica guardado e pode ser transcrito depois. 🟡
   - Origem: `_reversa_sdd/sdd/media-transcription.md#11. Edge Cases e Tratamento de Erros` (EC-01, EC-02, EC-04), `#6.3` (fluxo A)
   - Tipo: nova
7. **RN-07:** Áudio capturado ao vivo passa na frente dos áudios de uma importação grande. A fila de transcrição nunca impede a ingestão das mensagens de texto nem as respostas do agente. 🟡
   - Origem: `_reversa_sdd/sdd/media-transcription.md#11` (EC-03)
   - Tipo: nova
8. **RN-08:** Reimportar a mesma conversa depois da S4 acrescenta uma única vez as mensagens de áudio (antes só contadas) e não duplica nada. Áudio sem o arquivo no ZIP, ou exportado como `<Mídia oculta>`, vira mensagem de áudio `unavailable`. Ela é contada no relatório, mas não é pesquisável. 🟡
   - Origem: `_reversa_sdd/sdd/whatsapp-export-importer.md#11` (EC-02), `#6.3` (fluxo A); idempotência da S1
   - Tipo: alterada
9. **RN-09:** Áudio mandado diretamente ao agente continua recebendo o aviso de "só texto". Tratar esse áudio como pergunta ou como conteúdo a guardar é decisão da S8 (`conversational-agent.md#14` OQ-02). 🟢
   - Origem: `_reversa_sdd/addenda/003-perguntar-pelo-whatsapp.md`
   - Tipo: mantida
10. **RN-10:** Nesta fatia só os áudios são guardados e transcritos. Imagens, documentos e outras mídias continuam só contados. O caminho do anexo não depende do tipo de mídia: receber, guardar, enfileirar o processamento e indexar o resultado. Guardar outro tipo deve ser uma escolha de configuração, e processá-lo (OCR, extração de PDF, descrição de imagem) deve ser só um processador novo para aquele tipo. Nenhum dos dois pode exigir mudar o esquema nem o fluxo. 🟢
   - Origem: `_reversa_sdd/sdd/media-transcription.md#6` (RF-01, anexos em geral), `_reversa_sdd/addenda/bug-BUG-20261123-S57G-v001.md` (vínculo futuro do arquivo à legenda); esclarecimento de 2026-11-23
   - Tipo: nova

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | Na importação, o sistema deve vincular cada referência de áudio no `.txt` ao arquivo do ZIP. Cada uma vira uma mensagem de áudio com autor e data, e o arquivo vai para o armazenamento privado. | Must | Importar um ZIP com 3 áudios referenciados gera 3 mensagens de áudio com os arquivos guardados. O relatório mostra "Áudios vinculados: 3". | 🟡 |
| RF-02 | O sistema deve importar como `unavailable` o áudio referenciado e ausente do ZIP, ou exportado sem mídia, e contá-lo no relatório. | Must | Num ZIP sem o arquivo de um áudio citado, a mensagem existe como `unavailable`, o relatório mostra "Áudios ausentes: 1" e nada é transcrito. | 🟡 |
| RF-03 | Na captura ao vivo de grupo autorizado, o sistema deve baixar o áudio pelo provedor, guardá-lo e criar a mensagem de áudio. Falha no download tem até 3 tentativas com backoff; depois, a mensagem fica `unavailable`. | Must | Um áudio enviado no grupo autorizado fica guardado e na fila de transcrição. No provedor simulado, uma falha de download repetida termina em `unavailable`, sem perder a mensagem. | 🟡 |
| RF-04 | O sistema deve guardar o arquivo num bucket privado, com chave por espaço, fonte, mensagem e anexo, e calcular o SHA-256 para não guardar duas vezes o mesmo arquivo da mesma fonte. | Must | O mesmo áudio vindo pela captura e pela importação resulta em 1 objeto no bucket. Acesso sem credencial ao bucket é recusado. | 🟡 |
| RF-05 | O sistema deve reconciliar o áudio ao vivo com o importado pela RN-04, nos dois sentidos. | Must | Importar depois de capturar (e o contrário) mantém 1 mensagem de áudio, com as duas proveniências, e o relatório conta "Reconciliadas". | 🟡 |
| RF-06 | Na mesma transação em que grava a mensagem de áudio guardada, o sistema deve publicar o job de transcrição. | Must | Todo áudio guardado tem exatamente um job de transcrição, mesmo com o processo derrubado logo depois da gravação. | 🟡 |
| RF-07 | O sistema deve transcrever atrás de uma interface `Transcriber`, em pt-BR por padrão, com a implementação escolhida por configuração; o padrão é o Whisper local (RN-03). A transcrição grava o texto, o idioma, o motor, o modelo, a versão e os segmentos com início e fim em segundos. | Must | A transcrição de um áudio de teste de 3 min tem segmentos contíguos cobrindo a duração e registra o motor e o modelo usados. Trocar o `Transcriber` por um falso nos testes, ou trocar o modelo do Whisper por configuração, não muda nenhum outro componente. Um teste de arquitetura impede que algo fora do adaptador importe o motor. | 🟢 |
| RF-08 | Depois de transcrever, o sistema deve indexar a mensagem. Cada trecho guarda a faixa de tempo do áudio de onde saiu. | Must | Uma palavra falada no áudio de teste é encontrada pela busca, e o resultado traz `audio_start_s` e `audio_end_s`. | 🟡 |
| RF-09 | O agente deve responder no formato de áudio da RN-05 quando a evidência for um áudio. | Must | A pergunta "em qual áudio falaram de Temporal?" recebe a citação com autor, conversa, data, duração, o ponto do trecho (ex.: "aos 1:23") e o trecho transcrito. | 🟡 |
| RF-10 | O sistema deve aplicar os limites e falhas da RN-06 e a prioridade da RN-07. | Must | Um áudio de 90 min fica `too_long`, um arquivo corrompido fica `failed` sem nova tentativa, e um áudio ao vivo enfileirado depois de 50 importados é transcrito antes deles. | 🟡 |
| RF-11 | O sistema deve oferecer um comando de medição que compara modelos de transcrição candidatos num conjunto local de áudios. Ele mostra o fator de tempo real e a taxa de erro de palavras (WER), sem mostrar conteúdo. O conjunto tem duas partes:<br>• 15 a 20 áudios reais do T3 transcritos à mão pelo usuário, só em `exports/`;<br>• uma amostra de um conjunto público em pt-BR, para comparar com números publicados.<br>O comando usa a mesma interface `Transcriber` e serve para medir também um motor futuro. | Must | O comando roda sobre os candidatos (Whisper `small`, `medium` e `large-v3-turbo`, em CPU) e imprime, por modelo e por parte do conjunto, o fator de tempo real, o WER e o uso de memória. Nenhum texto transcrito ou de referência aparece na saída nem nos logs. O modelo padrão é o mais preciso que fique com WER ≤ 20% e fator de tempo real ≤ 0,5. | 🟢 |
| RF-12 | Os adaptadores do WhatsApp e de teste devem declarar `supportsMedia` e passar a suíte de contrato com os testes de mídia (`fetchMedia`). | Must | A suíte de contrato roda os testes de mídia, hoje pulados, para o canal de teste e para o WhatsApp simulado, e todos passam. | 🟡 |
| RF-13 | O sistema deve expor no painel e em métricas:<br>• o tamanho da fila de transcrição;<br>• o fator de tempo real;<br>• os áudios guardados, transcritos, vazios e com falha, por motivo;<br>• o tempo entre a chegada do áudio e o fim da transcrição. | Should | O painel mostra a fila descendo durante a importação do T3. Um alerta dispara quando a fila não diminui por 30 min com o worker no ar. | 🟡 |
| RF-14 | O sistema deve permitir desligar a transcrição por configuração, sem perder os áudios. | Should | Com a transcrição desligada, os áudios são guardados e ficam `pending`. Ao religar, a fila retoma, e textos e respostas não são afetados em nenhum momento. | 🟡 |
| RF-15 | O modelo de anexos e o fluxo de armazenamento e processamento devem ser comuns a todos os tipos de mídia (RN-10). Nesta fatia, só o áudio é guardado e só ele tem processador. | Must | Nos testes, ligar o armazenamento de imagens por configuração guarda a imagem sem migração nova. Registrar um processador falso para documentos faz o resultado ser indexado sem mudar o fluxo. | 🟢 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Qualidade | WER ≤ 20% no conjunto de medição, com o modelo escolhido | `media-transcription.md#3` (métrica de sucesso), OQ-01 | 🟡 |
| Desempenho | Fator de tempo real ≤ 0,5 na máquina de desenvolvimento (CPU, sem GPU): 1 min de áudio em até 30 s | `media-transcription.md#7` RNF-01 | 🟡 |
| Desempenho | Áudio ao vivo de até 2 min pesquisável em até 2 min depois de enviado, sem fila de importação na frente | Plano de fatias ("importado ou ao vivo"); `media-transcription.md#3` (≥ 95% em até 10 min) | 🟡 |
| Desempenho | A ingestão dos textos de uma importação com áudios mantém o tempo da S1 (10.000 mensagens em até 2 min). Os áudios seguem em segundo plano, e os 158 do T3 terminam de transcrever sem intervenção | `whatsapp-export-importer.md#7` RNF-01; export real | 🟡 |
| Recursos | Transcrição com até 4 GB de memória e concorrência configurável, sem travar o resto da máquina | Hardware medido (31 GB, 14 threads) | 🟡 |
| Segurança | Bucket privado, sem acesso anônimo, com os objetos criptografados em repouso. A chave fica fora do repositório, gerada e preservada pelo setup como a da sessão do WhatsApp | `media-transcription.md#7` RNF-03; padrão de `PALANTIR_WA_SESSION_KEY` | 🟡 |
| Privacidade | Logs, métricas, erros e saída do comando de medição sem texto transcrito, sem nome de arquivo de mídia e sem número de telefone. Áudios reais e transcrições de referência ficam só em `exports/` ou no bucket local, nunca no repositório | Regra dos exports reais (2026-11-23); `media-transcription.md#12` | 🟢 |
| Custo | R$ 0 por minuto de áudio: modelo local, sem provedor pago. Um serviço de transcrição externo é possível no futuro, só por escolha explícita (RN-03) | `media-transcription.md#7` RNF-02; esclarecimento de 2026-11-23 | 🟢 |
| Portabilidade | O motor de transcrição roda pelo `npm run setup` (Terraform/Docker) ou por dependência do projeto, sem instalação manual de ferramentas na máquina | ADR-0006; hoje não há ffmpeg instalado na máquina | 🟡 |
| Observabilidade | Painel "Mídia" no Grafana com fila, fator de tempo real e falhas por motivo; traces do job de transcrição | Padrão dos painéis da S2 e da S3 | 🟡 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Áudio importado encontrado pela palavra falada
  Dado a conversa "T3" importada com os áudios
  E a fila de transcrição vazia
  Quando o usuário pergunta ao agente "em qual áudio falaram de <palavra dita num áudio>?"
  Então a resposta cita o áudio com autor, conversa, data, duração e o ponto do trecho
  E mostra o trecho transcrito

Cenário: Áudio do grupo autorizado aparece em minutos
  Dado o grupo de teste autorizado e o worker rodando sem fila
  Quando um participante manda um áudio de 30 s no grupo
  E, 2 minutos depois, o usuário pergunta sobre o que foi falado
  Então a resposta cita esse áudio

Cenário: Mesmo áudio por captura e importação não duplica
  Dado um áudio capturado ao vivo no grupo autorizado
  Quando o usuário importa o export do mesmo grupo, com esse áudio
  Então existe 1 mensagem de áudio e 1 arquivo guardado
  E o relatório da importação conta 1 reconciliada

Cenário: Áudio de grupo não autorizado não é baixado
  Dado um grupo de que o número de captura participa, sem autorização
  Quando alguém manda um áudio nesse grupo
  Então nada é baixado nem gravado

Cenário: Áudio ausente no ZIP
  Dado um export cujo .txt cita um áudio que não está no ZIP
  Quando o usuário importa
  Então a mensagem de áudio é criada como indisponível
  E o relatório mostra "Áudios ausentes: 1"
  E a importação termina sem erro

Cenário: Áudio longo demais ou corrompido
  Dado um áudio de 90 min e um arquivo de áudio corrompido, ambos importados
  Quando a fila processa os dois
  Então o primeiro fica too_long e o segundo fica failed com motivo corrupted
  E nenhum dos dois é tentado de novo
  E os dois arquivos continuam guardados

Cenário: Reimportação depois da S4
  Dado a conversa "T3" importada antes da S4, com os áudios só contados
  Quando o usuário importa o mesmo export de novo
  Então as mensagens de áudio entram uma única vez
  E as mensagens de texto aparecem como "Já existentes"

Cenário: Transcrição desligada não perde áudio
  Dado a transcrição desligada por configuração
  Quando um export com áudios é importado
  Então os áudios ficam guardados e pendentes
  E perguntas sobre textos continuam respondidas normalmente

Cenário: Medição dos modelos sem expor conteúdo
  Dado o conjunto local de medição
  Quando o operador roda o comando de medição
  Então a saída mostra, por modelo, o fator de tempo real, o WER e a memória
  E nenhum trecho transcrito aparece na saída nem nos logs
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|---------------|
| RF-01, RF-02, RF-06, RF-07, RF-08, RF-09 | Must | É a pergunta que originou o projeto, sobre o histórico importado |
| RF-03, RF-05 | Must | "Importado ou ao vivo" é o resultado prometido da fatia |
| RF-04, RF-10 | Must | Privacidade do armazenamento e fila que não trava nem esconde falhas |
| RF-11 | Must | A decisão pendente da fatia (modelo local) precisa de números |
| RF-12 | Must | Mantém o adaptador substituível (WhatsApp-first, not only) |
| RF-15 | Must | Ligar imagens e documentos depois não pode exigir refazer o fluxo (decisão de 2026-11-23) |
| RF-13, RF-14 | Should | Operação da fila grande do T3 e rollback sem perda |
| Retranscrever com outro modelo (`media-transcription.md` RF-07) | Won't (S4) | O esquema já guarda versões; o comando de retranscrição fica para quando houver motivo medido |
| URL temporária para ouvir o áudio (`media-transcription.md` RF-09) | Won't (S4) | Link local não abre no celular; "mostra a 2" com o áudio é a S7 |
| Diarização, tradução, vídeo, OCR | Won't | Fora do escopo da v0.1 (`media-transcription.md#4`) |

## 9. Esclarecimentos

### Sessão 2026-11-23

- **Q:** Quando a evidência for um áudio, o que o agente devolve na conversa?
  **R:** Só a citação em texto (autor, conversa, data, duração, minuto do trecho e trecho transcrito). Devolver o arquivo do áudio fica para a S7 ("mostra a 2"). Aplicado na RN-05 e na RF-09.
- **Q:** O que passa a ser guardado no armazenamento privado nesta fatia?
  **R:** Por enquanto, só o áudio. O fluxo de anexos precisa estar preparado para guardar e processar todos os tipos de mídia depois, por configuração e processadores novos, sem refazer esquema nem fluxo. Aplicado na RN-10 e na nova RF-15.
- **Q:** Como medir a qualidade da transcrição para escolher o modelo local?
  **R:** As duas coisas: 15 a 20 áudios reais do T3 transcritos à mão pelo usuário (só em `exports/`) e uma amostra de um conjunto público em pt-BR. Aplicado na RF-11.
- **Q:** (observação do usuário) O motor de transcrição precisa ser substituível?
  **R:** Sim. O modelo do Whisper precisa poder ser trocado, e o motor também, inclusive por um serviço de transcrição SaaS no futuro. Aplicado na RN-02, na RN-03, na RF-07 e no requisito de custo: interface `Transcriber` com implementação escolhida por configuração; o serviço externo só por escolha explícita, porque o áudio sai da máquina; nesta fatia só existe o adaptador local.

## 10. Lacunas

- 🟡 OQ-02 da spec de transcrição (nomes técnicos como "Temporal" com WER de 20%): será observada na medição e na demonstração; não bloqueia a fatia.
- 🟡 Base legal (LGPD) para guardar áudios de terceiros: continua aberta (`identity-and-sources.md#14` OQ-01) e limita o uso aos grupos de teste e às conversas importadas pelo próprio usuário, não esta fatia.
- 🟡 Áudio mandado ao agente (OQ-02 do agente) continua para a S8 (RN-09).

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-23 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-11-23 | `/reversa-clarify`: 3 dúvidas resolvidas (forma da resposta, escopo do armazenamento, conjunto de medição), motor de transcrição substituível (inclusive SaaS) e nova RF-15 (anexos genéricos) | reversa |

## Emendas

### E001, 2026-11-24

O que muda: quando a pergunta fala em "áudio" ou "áudios" ("em qual áudio falaram de X?"), o agente busca só entre mensagens de áudio e não usa a palavra "áudio" como termo de busca; sem áudio sobre o assunto, responde "Não encontrei áudio sobre isso." em vez de citar mensagens de texto.
Motivo: na demonstração de 2026-11-24, "em qual áudio falaram de Apenas um teste?" trouxe o áudio certo em 2º lugar, atrás de uma mensagem de texto, e trouxe uma terceira mensagem só porque o texto dela dizia "áudio".
Arquivos previstos: `src/modules/agent/domain/answer.ts`, `src/modules/agent/application/ask-question.ts`, `src/modules/retrieval/application/search-evidence.ts`, `src/modules/retrieval/infrastructure/pg-search-index.ts`, testes unitários e de integração da busca.
