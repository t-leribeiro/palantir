# Onboarding: testar "guarda em <tema>" pela primeira vez (fatia S8)

> Identificador: `009-guardar-por-tema`
> Tempo estimado: 25 minutos

## Pré-requisitos

1. Node 22 ativo e o ambiente das fatias anteriores de pé: `npm run setup`, depois `npm run db:migrate`, que aplica a `0011_saved_items.sql`.
2. O chip do agente pareado (S2) e a sua conta verificada pelo código do `whatsapp:link` (S5).
3. A mídia da S4 configurada no `.env` (chave de mídia e SeaweedFS), para guardar áudio. Para a transcrição do áudio guardado, o motor ligado: `docker start palantir-transcriber`.
4. Processos: `npm run dev:worker` e `npm run dev:whatsapp`.

## Roteiro com o chip

1. **Encaminhar e guardar.** Encaminhe ao agente uma mensagem de texto de qualquer conversa. Ele responde uma vez: "Recebi. Para guardar, mande 'guarda em <tema>'". Mande "guarda em arquitetura". Confira "Guardei em arquitetura."
2. **Vários de uma vez.** Encaminhe 3 mensagens juntas. Só a primeira recebe o aviso. Mande "guarda em leituras" e confira "Guardei 3 itens em leituras."
3. **Responder citando.** Encaminhe 2 mensagens. Toque em "responder" na segunda e mande "guarda em decisões". Só ela é guardada. Mande "guarda em rascunho" sem citar: a primeira vai para "rascunho".
4. **Numa mensagem só.** Mande "guarda em leituras: https://exemplo.com artigo sobre filas".
5. **Áudio.** Encaminhe um áudio, ou grave um para o agente, e mande "guarda em reuniões". Depois da transcrição (uns 2 minutos), pergunte algo que foi falado nele: a resposta cita "Guardados · reuniões".
6. **Foto.** Encaminhe uma foto com legenda e guarde. Depois uma sem legenda: o agente avisa que só guarda a legenda.
7. **Recuperar.** Mande "o que guardei sobre leituras?". Vêm os itens numerados, do mais recente ao mais antigo. Mande "mostra a 1": o item inteiro, com "Guardado em leituras", sem "Conversa em volta".
8. **Temas.** Mande "temas": aparecem os temas com a quantidade de itens. Mande "guardados Leituras" com outra grafia: é o mesmo tema.
9. **Duplicata.** Guarde de novo, em "leituras", o mesmo texto do passo 4: "Isso já estava guardado em leituras."
10. **Na resposta normal.** Pergunte sobre o assunto de algo guardado. A resposta pode citar "Guardados · <tema>" junto com as conversas.
11. **Esquecer.** Liste "leituras" e mande "esquece a 1", depois "confirmo". Liste de novo: o item sumiu.
12. **Sem pedido.** Encaminhe uma mensagem e espere 10 minutos sem pedir nada. Mande "guarda em teste": "Não há nada para guardar."
13. **Ajuda.** Mande "ajuda": aparecem "guarda em <tema>" e "guardados <tema>".
14. **Apagar tudo (opcional, no fim).** Mande "grupos": "Guardados (N itens)" aparece no fim da lista. "apagar Guardados" e "confirmo apagar Guardados" apagam todos os itens.

## O que conferir fora do WhatsApp

- Painel "Gestão": `agent_save_total`, `agent_saved_listing_total` e `agent_forwarded_total`.
- `npm run auditoria`: `knowledge.item_saved` e `knowledge.item_forgotten`, sem tema nem conteúdo.
- Logs (Loki) do WhatsApp, do agente e do worker: nenhum texto guardado, nenhum tema, nenhum telefone.

## Se algo der errado

- **O encaminhado virou pergunta ("não encontrei"):** a versão rc do Baileys não marcou o encaminhado nesse tipo de mensagem. Anote o tipo (texto puro, com link, mídia). É a premissa do roadmap §4.
- **"Não consigo guardar áudio agora":** confira a chave de mídia e o SeaweedFS (`npm run doctor`).
- **O áudio guardado não aparece na busca:** a transcrição pode estar na fila. `npm run media:conferir` mostra o estado. O motor precisa estar ligado.
- **Reiniciou o WhatsApp e "Não há nada para guardar":** o que esperava pedido fica só na memória. Encaminhe de novo.
