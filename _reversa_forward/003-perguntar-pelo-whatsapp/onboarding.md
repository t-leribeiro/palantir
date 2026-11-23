# Onboarding: perguntar pelo WhatsApp (S2)

Roteiro para testar a fatia pela primeira vez com o chip real, partindo de uma máquina sem as fatias anteriores rodadas. Tempo estimado: 20 minutos.

## Antes de começar

- Celular com o **chip secundário** e o WhatsApp instalado nele (é o número do agente). Não use o seu número pessoal.
- Seu celular pessoal, de onde você vai perguntar.
- Uma conversa exportada do WhatsApp (Mais opções → Exportar conversa → sem mídia ou com mídia), salva em `exports/` (fora do git).
- Docker Desktop aberto.
- **Node 22 ativo** no terminal: `node --version` deve mostrar `v22`. Com nvm no Windows: `nvm use 22.23.5` (pode pedir um terminal de administrador). Com Node 18, os comandos falham com `bad option: --env-file-if-exists`.
- **PowerShell:** o Node 22 traz o `npm` como script (`npm.ps1`). Se aparecer "a execução de scripts foi desabilitada", rode uma vez `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, ou use `npm.cmd` no lugar de `npm`.
- Opcional, para os acentos dos logs saírem certos no PowerShell: `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`.

A demonstração usa três terminais: o **canal** (`dev:whatsapp`), o **worker** (`dev:worker`, indexa as mensagens importadas) e um livre para os comandos.

## 1. Preparar o ambiente

```bash
npm run setup        # sobe Docker e observabilidade, gera o .env (inclusive PALANTIR_WA_SESSION_KEY)
npm run db:migrate   # cria as tabelas, inclusive a de recibos da S2
```

No `.env`, mude `PALANTIR_WHATSAPP_ENABLED` para `true` (o `setup` preserva esse valor nas próximas execuções).

## 1.1 Importar e indexar uma conversa (S1)

Sem conversa importada e indexada, toda pergunta recebe "Não encontrei evidências suficientes.".

1. No terminal do **worker**: `npm run dev:worker` (deixe rodando).
2. No terminal livre: `npm run import -- exports/<arquivo.zip> --conversa "<nome do grupo>"`. O relatório mostra quantas mensagens entraram; o worker as torna pesquisáveis em segundos.

O `--conversa` é o nome que aparece nas citações das respostas.

## 2. Cadastrar o seu número pessoal

```bash
npm run whatsapp:link -- "+55 11 9XXXX-XXXX"
```

Você deve ver o número mascarado e "conta WhatsApp ativa".

## 3. Parear o número do agente

```bash
npm run dev:whatsapp
```

1. Um QR Code aparece no terminal.
2. No celular do chip: WhatsApp → Configurações → Dispositivos conectados → Conectar dispositivo → leia o QR.
3. O terminal mostra "WhatsApp conectado". Em outra janela: `curl http://localhost:8081/health` mostra `"whatsapp": "connected"`.

## 4. Perguntar

Do seu celular pessoal, mande para o número do chip:

| Você manda | Você deve receber |
|------------|-------------------|
| `oi` | a ajuda curta com exemplos de perguntas |
| uma pergunta com palavras que aparecem na conversa importada | a resposta com autor, conversa e data |
| `alguém falou de marte?` | `Não encontrei evidências suficientes.` |
| um áudio | `Por enquanto eu só entendo mensagens de texto.` |

## 5. Conferir as garantias

- **Reiniciar sem novo QR:** pare o processo (Ctrl+C) e rode `npm run dev:whatsapp` de novo. Ele conecta sem QR.
- **Recriar o ambiente:** `npm run teardown`, `npm run setup`, `npm run db:migrate` e `npm run whatsapp:link -- ...` de novo. O WhatsApp conecta sem QR, porque a sessão fica fora do banco. A conversa precisa ser importada de novo (passo 1.1, com o worker rodando), porque o banco foi recriado.
- **Desconhecido não recebe nada:** peça para alguém mandar uma mensagem ao chip. Ninguém recebe resposta, e o painel "WhatsApp" do Grafana conta 1 remetente desconhecido.
- **Logs limpos:** no Grafana (Explore → Loki), procure pelo seu número ou pelo texto da pergunta. Nada deve aparecer.

## 6. Encerrar a sessão (opcional)

No celular do chip, remova o dispositivo conectado. Em até 60 s, o health mostra `logged_out`, o log pede novo pareamento e o alerta `WhatsAppLoggedOut` aparece no Prometheus.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---------|----------------|-------------|
| `bad option: --env-file-if-exists` | Node 18 ativo | `nvm use 22.23.5` |
| "a execução de scripts foi desabilitada" | política do PowerShell bloqueia o `npm.ps1` do Node 22 | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, ou `npm.cmd` |
| `canal WhatsApp desligado` e o processo encerra | `PALANTIR_WHATSAPP_ENABLED=false` | mude para `true` no `.env` |
| Toda pergunta recebe "Não encontrei evidências suficientes." | conversa não importada, ou importada sem o worker rodando (fica sem índice) | passo 1.1; com o worker no ar, a fila pendente é indexada sozinha |
| `stream errored out` seguido de `reconnecting` logo após ler o QR | reinício normal pedido pelo WhatsApp depois do pareamento | nada; conecta em segundos |
| O agente não responde a você | número cadastrado diferente do que o WhatsApp informa | confira o log `reason=unresolved` ou `unknown`; recadastre com o número completo, com o 9 |
| Pede QR a cada início | `PALANTIR_WA_SESSION_KEY` mudou ou a pasta da sessão foi apagada | mantenha a chave do `.env`; pareie de novo |
| `logged_out` logo após conectar | o WhatsApp encerrou a sessão (possível bloqueio) | pare, espere e pareie de novo; se repetir, registre e não insista |
