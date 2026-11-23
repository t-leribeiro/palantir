# Onboarding: perguntar pelo WhatsApp (S2)

Roteiro para testar a fatia pela primeira vez com o chip real. Tempo estimado: 15 minutos.

## Antes de começar

- Celular com o **chip secundário** e o WhatsApp instalado nele (é o número do agente). Não use o seu número pessoal.
- Seu celular pessoal, de onde você vai perguntar.
- Ambiente local no ar: Docker ligado e, na pasta do projeto, Node 22 no PATH.
- Pelo menos uma conversa importada (S1). Se não tiver, importe uma:
  `npm run import -- <arquivo.zip> --conversa "Comunidade DevOps"`

## 1. Preparar o ambiente

```bash
npm run setup        # gera PALANTIR_WA_SESSION_KEY no .env, se ainda não existir
npm run db:migrate   # aplica a tabela de recibos
```

No `.env`, mude `PALANTIR_WHATSAPP_ENABLED` para `true`.

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
| uma pergunta sobre a conversa importada (ex.: `quem recomendou o Temporal?`) | a resposta com autor, conversa e data |
| `alguém falou de marte?` | `Não encontrei evidências suficientes.` |
| um áudio | `Por enquanto eu só entendo mensagens de texto.` |

## 5. Conferir as garantias

- **Reiniciar sem novo QR:** pare o processo (Ctrl+C) e rode `npm run dev:whatsapp` de novo. Ele conecta sem QR.
- **Recriar o ambiente:** `npm run teardown`, `npm run setup`, `npm run db:migrate`, `npm run seed` e `npm run whatsapp:link -- ...` de novo. O WhatsApp conecta sem QR, porque a sessão fica fora do banco. A conversa importada precisa ser importada de novo, porque o banco foi recriado.
- **Desconhecido não recebe nada:** peça para alguém mandar uma mensagem ao chip. Ninguém recebe resposta, e o painel "WhatsApp" do Grafana conta 1 remetente desconhecido.
- **Logs limpos:** no Grafana (Explore → Loki), procure pelo seu número ou pelo texto da pergunta. Nada deve aparecer.

## 6. Encerrar a sessão (opcional)

No celular do chip, remova o dispositivo conectado. Em até 60 s, o health mostra `logged_out`, o log pede novo pareamento e o alerta `WhatsAppLoggedOut` aparece no Prometheus.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---------|----------------|-------------|
| O agente não responde a você | número cadastrado diferente do que o WhatsApp informa | confira o log `reason=unresolved` ou `unknown`; recadastre com o número completo, com o 9 |
| Pede QR a cada início | `PALANTIR_WA_SESSION_KEY` mudou ou a pasta da sessão foi apagada | mantenha a chave do `.env`; pareie de novo |
| `logged_out` logo após conectar | o WhatsApp encerrou a sessão (possível bloqueio) | pare, espere e pareie de novo; se repetir, registre e não insista |
