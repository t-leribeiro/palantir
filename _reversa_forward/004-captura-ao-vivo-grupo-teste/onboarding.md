# Onboarding: captura ao vivo de um grupo de teste (S3)

Roteiro para testar a fatia pela primeira vez, partindo de uma máquina sem as fatias anteriores rodadas. Tempo estimado: 30 minutos. Não depende dos guias da S1 nem da S2: tudo o que é preciso está aqui.

## Antes de começar

- **Grupo de teste:** um grupo pequeno do WhatsApp (até ~10 pessoas) cujos participantes foram avisados de que as mensagens serão guardadas pelo Palantír e concordaram. Anote como e quando o aviso foi feito; você vai declarar isso no comando de autorização.
- **Celular com o chip do agente**, com o WhatsApp instalado. Nesta fatia ele também captura (modo `agent`). Peça a um administrador para **adicionar o número do chip ao grupo de teste**.
- **Seu celular pessoal**, de onde você faz as perguntas. Ele também precisa estar no grupo, para mandar mensagens de teste.
- **Docker Desktop** aberto.
- **Node 22 ativo:** `node --version` deve mostrar `v22`. Com nvm no Windows: `nvm use 22.23.5`. Com Node 18, os comandos falham com `bad option: --env-file-if-exists`.
- **PowerShell:** se aparecer "a execução de scripts foi desabilitada", rode uma vez `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, ou use `npm.cmd` no lugar de `npm`. Para os acentos dos logs saírem certos: `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`.
- **Opcional,** para testar a reconciliação: um export desse grupo (Mais opções → Exportar conversa), salvo em `exports/` (fora do git).

A demonstração usa três terminais: **canal** (`dev:whatsapp`), **worker** (`dev:worker`, que torna as mensagens pesquisáveis) e um **livre** para os comandos.

## 1. Preparar o ambiente

```bash
npm run setup        # sobe Docker e observabilidade, gera ou preserva o .env
npm run db:migrate   # cria as tabelas, inclusive as da captura (0006)
```

No `.env`:
- `PALANTIR_WHATSAPP_ENABLED=true`
- `PALANTIR_WHATSAPP_CAPTURE=agent`

## 2. Cadastrar o seu número (se ainda não fez na S2)

```bash
npm run whatsapp:link -- "+55 11 9XXXX-XXXX"
```

## 3. Subir worker e canal

1. Terminal do **worker**: `npm run dev:worker` (deixe rodando).
2. Terminal do **canal**: `npm run dev:whatsapp`. Se a sessão da S2 existir, conecta sem QR; senão, leia o QR com o celular do chip (Aparelhos conectados → Conectar um aparelho).
3. Espere "WhatsApp conectado". O health (`curl http://localhost:8081/health`) mostra `"whatsapp": "connected"` e `"capture": "connected"`.

## 4. (Opcional) Importar o histórico do grupo

Se quiser que o grupo ao vivo e o histórico sejam a mesma conversa:

```bash
npm run import -- exports/<grupo>.zip --conversa "<nome>"
```

## 5. Autorizar o grupo de teste

```bash
npm run whatsapp:grupos
```

O grupo de teste aparece como "não autorizado". Autorize pelo número da listagem:

```bash
npm run whatsapp:grupos -- autorizar 1 --consentimento "todos avisados no grupo em 23/11, ninguém se opôs" --conversa "<nome>"
```

Sem `--conversa`, o grupo vira uma conversa nova com o nome que ele tem no WhatsApp.

## 6. Ver a captura funcionando

| Você faz | Você deve ver |
|----------|---------------|
| No grupo, do seu celular: `recomendo o Grafana Tempo para traces` | Nada no grupo (o número nunca escreve lá) |
| Em mensagem direta ao chip, uns 10 s depois: `quem recomendou o Tempo?` | Resposta citando você, o grupo e o horário |
| No grupo: um áudio | Nada guardado; o painel "WhatsApp" do Grafana conta 1 mídia ignorada |
| Em outro grupo do chip, não autorizado: uma mensagem | Nada guardado; uma pergunta sobre ela recebe "Não encontrei evidências suficientes." |

## 7. Revogar

```bash
npm run whatsapp:grupos -- revogar 1
```

Mande uma mensagem nova no grupo e pergunte sobre ela: "Não encontrei evidências suficientes.". Pergunte sobre a do passo 6: continua respondida.

Para voltar a capturar, autorize de novo (passo 5).

## 8. (Opcional) Reconciliação com um export novo

1. Com a captura ligada, troque umas 10 mensagens no grupo.
2. Exporte o grupo de novo no celular e importe com o **mesmo** `--conversa` do passo 5.
3. O relatório mostra `Reconciliadas com a captura ao vivo: 10` (ou perto disso). Uma pergunta sobre uma delas recebe **uma** citação, não duas.

## 9. Conferir as garantias

- **Logs limpos:** no Grafana (Explore → Loki), procure o texto de uma mensagem do grupo, seu número ou o nome do grupo. Nada deve aparecer.
- **Reiniciar:** `Ctrl+C` no canal e `npm run dev:whatsapp` de novo. Conecta sem QR, e o grupo continua autorizado.
- **Desligar a captura:** `PALANTIR_WHATSAPP_CAPTURE=off` e reinicie. O health mostra `"capture": "off"`, mensagens do grupo não são guardadas e o agente continua respondendo.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---------|----------------|-------------|
| `whatsapp:grupos` diz "Nenhum grupo conhecido" | captura desligada ou processo nunca rodou com ela | `PALANTIR_WHATSAPP_CAPTURE=agent` e `npm run dev:whatsapp` |
| O grupo não aparece na lista | o chip ainda não foi adicionado ao grupo, ou a lista está antiga | adicione o chip; com o processo no ar, a lista atualiza sozinha |
| A pergunta não encontra a mensagem do grupo | worker parado, ou palavras diferentes das usadas no grupo | suba o `dev:worker`; pergunte com palavras da mensagem (busca por palavras até a S6) |
| `autorizar` recusa o consentimento | texto ausente ou com menos de 10 caracteres | descreva como e quando os participantes foram avisados |
| `Não há conversa importada com o nome ...` | o `--conversa` não bate com o nome usado no `import` | use exatamente o nome do `npm run import -- ... --conversa` |
| Autor aparece como "Participante" | o WhatsApp não informou nome nem número dessa pessoa | esperado em alguns grupos; grupo e horário continuam na citação |
