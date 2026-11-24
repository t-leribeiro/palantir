# Interface: comandos de gestão e verificação pelo agente

> Feature: `006-gerenciar-grupos-pelo-agente` · Decisões D-01, D-02, D-05, D-11, D-14, D-15, D-20
> Canal: qualquer `KnowledgeChannel` (WhatsApp e canal de teste), sempre em conversa direta com o agente.

## 1. Ordem de tratamento de uma mensagem direta

1. **Resolver a conta do remetente** (`provider`, `externalAccountId`):
   - desconhecida: silêncio no WhatsApp e a orientação de vínculo no canal de teste (política da S2);
   - `pending`: segue para o passo 2, e nada além disso;
   - `active` e verificada: segue para o passo 3.
2. **Conta `pending`:**
   - texto de exatamente 6 dígitos, com ou sem espaços: tenta verificar;
   - qualquer outra coisa: recebe a instrução de verificação.
3. **Ação pendente** que ainda vale e mensagem que é a confirmação dela: executa a ação.
4. **Comando de gestão** reconhecido: executa.
5. **Ajuda:** mostra a ajuda.
6. **Senão, pergunta:** a busca, com o filtro "em qual áudio" (E001) e o filtro por grupo (RN-11).

Antes de comparar, o texto é normalizado: minúsculas, sem acento, espaços colapsados e pontuação final removida.

## 2. Comandos

| Entrada (exemplos) | Ação | Resposta (resumo) |
|--------------------|------|-------------------|
| `grupos`, `meus grupos`, `listar grupos`, `conversas` | Lista os itens 1 a 30 e grava o estado (`listing`, página 1) | `Seus grupos e conversas (1–30 de 58):` e uma linha por item, `4. Projeto X · não acompanhado` (estados: `acompanhando`, `parado`, `não acompanhado`, `importada`, `acompanhado por outra conta`), mais `Mande "mais" para ver o resto.` |
| `mais` | Mostra a próxima página da lista vigente | As próximas 30 linhas, ou `Não há mais itens.` |
| `acompanhar <ref>` | Cria a ação pendente `follow` (5 min) | `Para acompanhar "Projeto X", confirme que os participantes foram informados e concordam em ter as mensagens guardadas. Responda "confirmo" em até 5 minutos.`, e, quando houver importação de mesmo nome, `O histórico importado de "Projeto X" será ligado a este grupo.` |
| `confirmo` (com `follow` pendente) | Autoriza a captura (D-05, D-06) e audita | `Pronto: "Projeto X" está sendo acompanhado. As mensagens novas entram a partir de agora.` |
| `parar <ref>` | Revoga a captura e audita | `Parei de acompanhar "T3". O histórico continua disponível nas perguntas; para apagá-lo, mande "apagar T3".` |
| `apagar <ref>` | Cria a ação pendente `delete` (5 min) | `Isso apaga "T3" e tudo o que veio dele: mensagens, áudios e transcrições. Não dá para desfazer. Para confirmar, responda "confirmo apagar T3" em até 5 minutos.` |
| `confirmo apagar <nome>` | Pede a exclusão (D-07) e audita | `Apagando "T3". Aviso aqui quando terminar.` |
| `ajuda` | Ajuda com a seção "Seus grupos" (D-18) | Exemplos de cada comando |

`<ref>` aceita três formas: o número da última lista mostrada, válido por 30 min; o nome exato da conversa; ou um trecho do nome que identifique uma única conversa (D-15).

Exemplo do aviso de conclusão, mandado por `agent.notify`: `Terminei de apagar "T3": 9.842 mensagens e 158 áudios. Nada dele aparece mais nas respostas.`

## 3. Verificação da conta

| Entrada | Condição | Resposta |
|---------|----------|----------|
| `482913` | código vivo, certo e dentro do prazo | `Conta verificada. Pode perguntar e gerenciar seus grupos por aqui.` |
| `482910` | código errado; ainda há tentativas | `Código incorreto. Restam N tentativas.` |
| 5ª tentativa errada | | `Código invalidado. Peça um novo com npm run whatsapp:link.` (audita `account.verification_locked`) |
| qualquer código | expirado, consumido ou inexistente | `Código expirado. Peça um novo com npm run whatsapp:link.` |
| outro texto | conta `pending` | `Sua conta ainda não foi verificada. Mande aqui o código de 6 dígitos que aparece ao rodar npm run whatsapp:link.` |

## 4. Erros e casos-limite

| Situação | Resposta | Efeito |
|----------|----------|--------|
| `<ref>` serve para mais de uma conversa | `Encontrei mais de uma: 1. Contas da Casa · 2. Contas do Prédio. Repita com o número ou o nome completo.` (grava esta lista curta como a lista vigente) | nenhum |
| número fora da lista ou lista expirada | `Não sei qual é o 4. Mande "grupos" para ver a lista atual.` | nenhum |
| `<ref>` não encontrado | `Não encontrei "xyz" entre suas conversas. Mande "grupos" para ver a lista.` | nenhum |
| `acompanhar` uma importada sem grupo, ou um grupo do qual o número saiu | `"X" é uma conversa importada: só dá para acompanhar grupos de que o número participa.` | nenhum |
| `acompanhar` o que já está acompanhado | `"X" já está sendo acompanhado desde 12/11/2026.` | nenhum |
| `parar` o que não está acompanhado | `"X" não está sendo acompanhado.` | nenhum |
| item `acompanhado por outra conta` | `Esse grupo é acompanhado por outra conta.` | nenhum |
| confirmação expirada | `O pedido expirou. Mande "apagar T3" de novo.` | a ação pendente é limpa |
| `confirmo apagar <outro nome>` | `Para apagar "T3", a confirmação precisa ser "confirmo apagar T3".` | a pendente continua até o prazo |
| `confirmo` sem nada pendente | trata como pergunta comum | |
| conversa já em exclusão | `"T3" já está sendo apagado.` | nenhum |
| comando escrito dentro de um grupo | (não é lido como comando: é mensagem do grupo) | segue a captura |

## 5. Filtro por grupo na pergunta (RN-11)

- **Reconhecimento:** o nome completo normalizado de uma fonte do espaço, que não esteja em exclusão, aparecendo na pergunta normalizada e cercado por limites de palavra. Se vários nomes aparecem, vale o mais longo.
- **Efeito:** o nome sai da pergunta, e a busca recebe `sourceIds`, com as fontes de mesmo nome.
- **Nome repetido** (mais de uma fonte com o nome reconhecido): `Há mais de uma conversa chamada "Família": 1. … 2. … Repita a pergunta com o nome completo diferente ou mande "grupos".` A busca não é feita.
- **Combinação com "em qual áudio":** os dois filtros valem juntos.

## 6. Idempotência e concorrência

- Cada mensagem recebida já é deduplicada pelo recibo da S2.
- A confirmação consome a ação pendente com `UPDATE … WHERE pending IS NOT NULL AND pending_expires_at > now() RETURNING`. Duas confirmações iguais executam no máximo uma vez.
- `acompanhar` e `apagar` conferem o estado de novo dentro da transação: a fonte pode ter mudado desde a lista.

## 7. Privacidade

As respostas vão só para a conversa direta de quem pediu. Logs e métricas registram o comando e o resultado (`listed`, `follow_requested`, `followed`, `stopped`, `delete_requested`, `delete_confirmed`, `ambiguous`, `not_found`, `expired`, `verified`, `code_wrong`, `code_locked`), sem nomes nem telefones.
