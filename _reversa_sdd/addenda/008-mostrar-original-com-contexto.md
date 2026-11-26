# Adendo: Ver a mensagem original com contexto (fatia S7)

> Feature: `008-mostrar-original-com-contexto`
> Data: `2026-11-25`
> Cenário: `greenfield`

## Vigência

Vigente desde 2026-11-25.

## Resumo da entrega

A resposta do agente cita até 3 mensagens, cada uma num trecho de até 280 caracteres. Agora, depois de uma resposta, o dono manda "mostra a 2" e recebe a mensagem da citação 2:
- inteira, com quem escreveu, a conversa, a data e a hora;
- com até 3 mensagens antes e 3 depois, da mesma conversa;
- se for áudio, com a transcrição completa, o trecho citado marcado e o próprio arquivo, enviado pelo WhatsApp como mensagem de voz.

O comando é reconhecido por palavras fixas ("mostra a N", "ver N", "original N"), sem LLM, e vale por 2 h depois da resposta. A resposta é montada no código, sem LLM. O arquivo do áudio só vai para a conta ativa dona do espaço e só na conversa direta. Ele é decifrado na memória e conferido pelo SHA-256.

As 17 ações foram concluídas, e o `progress.jsonl` tem 17 linhas `done`. A entrega está no PR #19, com os 7 jobs da CI verdes. A demonstração manual com o chip ainda não foi feita. Ela precisa confirmar que o áudio chega como mensagem de voz pela versão rc do Baileys.

## Impacto por artefato da extração

As specs continuam 🟡 PLANEJADO. Leia-as junto com este adendo, com os adendos `001` a `007` e com os de bug (`bug-*`).

| Artefato | Seção | Tipo de impacto | Delta |
|----------|-------|-----------------|-------|
| `_reversa_sdd/sdd/conversational-agent.md` | 6. Requisitos Funcionais | componente-novo | A RF-06 foi implementada, com mudanças:<br>• "mostra a N", "ver N" e "original N" (N de 1 a 9) são reconhecidos por palavras fixas em `agent/domain/show-source.ts`, depois dos comandos da S5 e antes da ajuda. Frases mais longas com "mostra" continuam perguntas;<br>• a resposta é montada por `composeOriginal`, sem LLM: cabeçalho, texto inteiro até 12.000 caracteres e "Conversa em volta" com a citada marcada por "»";<br>• em vez do link temporário, o áudio vem com a transcrição por segmentos, com o trecho citado marcado, numa janela de 6.000 caracteres, e com o arquivo anexado. |
| `_reversa_sdd/sdd/conversational-agent.md` | 6. Requisitos Funcionais | regra-alterada | Da RF-09, só as citações foram implementadas, sem as 10 trocas:<br>• toda resposta com citações grava os ids, o tipo e a faixa do trecho, por dono e canal, por 2 h, a contar da resposta;<br>• "não encontrei" não troca a lista;<br>• as citações ficam numa porta própria (`CitationStore`), implementada pelo mesmo `createPgConversationState` da S5. |
| `_reversa_sdd/sdd/conversational-agent.md` | 8. Design e Interface | regra-alterada | A ajuda ganhou a linha `Depois de uma resposta: "mostra a 2" abre a citação 2 inteira` e continua com até 600 caracteres. |
| `_reversa_sdd/sdd/conversational-agent.md` | 11. Edge Cases e Tratamento de Erros | regra-alterada | O EC-05 foi implementado: sem citações recentes, o agente diz que não há citações e pede a pergunta de novo. Novos casos:<br>• número acima da lista ("são só 2 citações");<br>• conversa em exclusão ("foi apagada");<br>• mensagem que não existe mais.<br>Em nenhum deles o agente busca. |
| `_reversa_sdd/sdd/conversational-agent.md` | 9. Modelo de Dados | delta-de-dados | Migração `0010_show_source.sql`: `agent_conversation_state.citations` (`jsonb`, só lista, com `CHECK`) e `citations_at`. Guarda só ids e a faixa do trecho, nunca texto. |
| `_reversa_sdd/sdd/retrieval.md` | 6. Requisitos Funcionais | componente-novo | A RF-07 foi implementada com K = 3 (`createPgSourceContext`, `retrieval/infrastructure/pg-source-context.ts`):<br>• lê a citada pelo id, dentro do espaço do dono, com o anexo de áudio, a transcrição ativa e os segmentos;<br>• devolve até 3 vizinhas de cada lado, só da mesma conversa e do mesmo espaço;<br>• a ordem é `(sent_at, created_at, id)`. No mesmo minuto, vale a ordem de gravação, que segue a do arquivo exportado;<br>• a posição da citada é calculada no próprio SQL. |
| `_reversa_sdd/sdd/retrieval.md` | 11. Edge Cases e Tratamento de Erros | regra-alterada | O EC-05 vale também para a busca por contexto: uma conversa em exclusão não é mostrada. |
| `_reversa_sdd/sdd/media-transcription.md` | 6. Requisitos Funcionais | regra-alterada | A RF-09 (URL temporária de 15 min) foi substituída pelo envio do arquivo pelo canal. `createLoadOutboundMedia` (`media/application/load-outbound-media.ts`):<br>• resolve a conta ativa (`channel_accounts`) e o espaço dela;<br>• lê o anexo guardado desse espaço;<br>• decifra com AES-256-GCM só na memória e confere o SHA-256.<br>Anexo de outro espaço, inexistente ou com hash diferente vira `expired`. Armazenamento fora do ar vira `download_failed`. |
| `_reversa_sdd/sdd/channel-contract.md` | 9. Modelo de Dados | delta-de-contrato-externo | Contrato 1.4.0, aditivo: `AgentReply.media` (no máximo 1 anexo, só `audio`, por referência ao `attachments.id`, até 16 MB, com `failureText` de até 500 caracteres). Respostas sem `media` continuam válidas. |
| `_reversa_sdd/sdd/channel-contract.md` | 6. Requisitos Funcionais | regra-nova | Porta `OutboundMediaLoader(destinationAccountId, ref)`, injetada pelo `src/main` em cada adaptador:<br>• cada adaptador busca os bytes por ela;<br>• sem loader, ou com falha, entrega o `failureText`;<br>• o canal de teste registra o anexo no `outbox` só com tamanho e SHA-256;<br>• a suíte de contrato ganhou os cenários de anexo entregue, de falha e de resposta sem anexo. |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` | 6. Requisitos Funcionais | regra-alterada | O provedor ganhou `sendAudio`:<br>• no Baileys, mensagem de voz (`ptt: true`), só em `baileys-provider.ts`, e recusa grupo;<br>• o canal manda o texto e depois o áudio pelo `pacer`, com tentativas;<br>• se falhar, manda o `failureText`;<br>• o loader recebe o telefone E.164 do dono, e o envio vai para o `chatJid`, que pode ser um LID.<br>Nenhum número escreve espontaneamente: o áudio só vai em resposta a um pedido do dono. |
| `_reversa_sdd/sdd/platform-foundation.md` | 6. Requisitos Funcionais | componente-novo | Peças novas:<br>• composição em `src/main/show-source.ts`, com o span `agent.show_source`, sem atributos;<br>• o loader é montado por canal. Sem chave de mídia ou sem S3 no `.env`, não é injetado e a subida avisa;<br>• métricas `agent_show_source_total{outcome, kind}` e `channel_media_sent_total{adapter, outcome}`, só com contagens;<br>• painéis em "Gestão" e "WhatsApp". |
| `_reversa_sdd/prd.md` | 4. Escopo (in) | componente-novo | "Recuperar a mensagem original ou o trecho de áudio citado" foi entregue: texto inteiro, contexto vizinho e, para áudio, a transcrição marcada e o arquivo. |
| `_reversa_sdd/prd.md` | 9. Critérios de aceite (alto nível) | regra-alterada | O "acesso à mensagem original" do P1 passa a ser "mostra a N" na mesma conversa com o agente, por 2 h. Isso falta confirmar na demonstração com o chip. |

Impactos registrados: 14 linhas, assim distribuídas:
- 7 `regra-alterada`
- 4 `componente-novo`
- 1 `delta-de-dados`
- 1 `delta-de-contrato-externo`
- 1 `regra-nova`

Regras 🟡 que evoluem:
- A RF-06 e a RF-09 de `conversational-agent`, a RF-07 de `retrieval` e a RF-09 de `media-transcription` mudaram como descrito na tabela.
- A RN-08 da S3 continua valendo: nenhum número escreve em grupos, e `sendAudio` também recusa grupo.

## Regras sob vigilância

W001 a W010, em `_reversa_forward/008-mostrar-original-com-contexto/regression-watch.md` (seção Observações).

## Fontes

- `_reversa_forward/008-mostrar-original-com-contexto/legacy-impact.md`
- `_reversa_forward/008-mostrar-original-com-contexto/regression-watch.md`
- `_reversa_forward/008-mostrar-original-com-contexto/requirements.md`
- `_reversa_forward/008-mostrar-original-com-contexto/roadmap.md` (D-01 a D-15)
- `_reversa_forward/008-mostrar-original-com-contexto/data-delta.md`
- `_reversa_forward/008-mostrar-original-com-contexto/progress.jsonl`
- `_reversa_forward/008-mostrar-original-com-contexto/actions.md` (Notas de execução)
- `_reversa_forward/008-mostrar-original-com-contexto/interfaces/`

## Atualização 2026-11-25

A demonstração com o chip foi feita pelo roteiro do `onboarding.md` da 008 e funcionou. O áudio chegou como mensagem de voz, o que confirma a premissa do `ptt` na versão rc do Baileys. Com isso, o critério P1 do `prd.md` ("acesso à mensagem original") fica atendido por "mostra a N". A S7 foi entregue no PR #19.
