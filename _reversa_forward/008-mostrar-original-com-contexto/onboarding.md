# Onboarding: testar "mostra a N" pela primeira vez (fatia S7)

> Identificador: `008-mostrar-original-com-contexto`
> Tempo estimado: 20 minutos

## Pré-requisitos

1. Node 22 ativo e o ambiente das fatias anteriores de pé: `npm run setup`, depois `npm run db:migrate`, que aplica a `0010_show_source.sql`.
2. O chip do agente pareado (S2) e a sua conta verificada pelo código do `whatsapp:link` (S5).
3. Uma conversa importada com áudios guardados, por exemplo o T3 da S4: `npm run media:conferir` mostra os áudios `stored`.
4. Motor de transcrição ligado só se for transcrever áudios novos (`docker start palantir-transcriber`). Para esta demonstração, basta o que já está transcrito.
5. Processos: `npm run dev:worker` e `npm run dev:whatsapp`.

## Roteiro com o chip

1. **Pergunta com citações.** Do seu WhatsApp, mande ao agente uma pergunta que você sabe responder pelo T3, por exemplo "quem falou do Sicoob?". A resposta lista até 3 citações numeradas.
2. **Mensagem de texto.** Mande "mostra a 1". Confira:
   - o cabeçalho com autor, conversa, data e hora;
   - o texto inteiro, sem o corte de 280 caracteres;
   - "Conversa em volta" com até 3 mensagens antes e 3 depois, e a citada marcada com "»".
3. **Áudio.** Pergunte "em qual áudio falaram de <assunto>?" e mande "ver 1". Confira:
   - a duração e a transcrição com o tempo de cada trecho, e o trecho citado marcado com "»";
   - logo depois, a mensagem de voz: ouça no celular e veja se é o áudio original.
4. **Número fora.** Se a última resposta teve 2 citações, mande "mostra a 3": o agente diz que são só 2.
5. **Não é comando.** Mande "me mostra o que a <pessoa> disse sobre <assunto>": vira pergunta normal.
6. **Ajuda.** Mande "ajuda": aparece a linha `Depois de uma resposta: "mostra a 2" abre a citação 2 inteira`.
7. **Vencidas (opcional).** Duas horas depois da última resposta, "mostra a 1" diz que não há citações recentes.

## O que conferir fora do WhatsApp

- Painel "Gestão": `agent_show_source_total` por resultado.
- Painel "WhatsApp": `channel_media_sent_total{outcome="sent"}`.
- Logs (Loki) do processo do WhatsApp e do agente: nenhum texto de mensagem, nenhum nome de grupo nem telefone.

## Se algo der errado

- **O áudio chega como arquivo e não como voz:** anote o tipo exibido. É a premissa do `ptt` no Baileys rc (roadmap §4).
- **"Não consegui mandar o arquivo do áudio agora":** confira se o SeaweedFS está de pé (`npm run doctor`) e se a `PALANTIR_MEDIA_KEY` do `.env` é a mesma da importação.
- **"Não tenho citações recentes" logo depois da resposta:** a resposta foi "não encontrei" (não grava citações) ou veio de outro canal.
