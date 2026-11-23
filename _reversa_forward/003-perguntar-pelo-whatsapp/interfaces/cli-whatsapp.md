# Interface: comandos do WhatsApp

## 1. `npm run dev:whatsapp`

Sobe o processo do canal WhatsApp (`src/main/whatsapp.ts`, papel `whatsapp`).

| Variável | Obrigatória | Padrão | Uso |
|----------|-------------|--------|-----|
| `PALANTIR_WHATSAPP_ENABLED` | não | `false` | `true` liga o canal; com `false`, o processo avisa e sai com código 0 |
| `PALANTIR_WA_SESSION_KEY` | sim, quando ligado | – | chave de 32 bytes em base64, gerada pelo `npm run setup` |
| `PALANTIR_WA_SESSION_DIR` | não | `~/.palantir/whatsapp/` | pasta do arquivo de sessão, fora do repositório |
| `PALANTIR_WHATSAPP_HEALTH_PORT` | não | `8081` | porta do `GET /health` do processo |
| `DATABASE_URL` | sim | – | identidade, busca e recibos |

Saídas:
- Sem sessão: desenha o QR Code no terminal e espera a leitura pelo celular do chip; um QR novo é desenhado quando o anterior expira.
- Com sessão: conecta direto. Logs só com estado, contagens e números mascarados.
- Erro de configuração (chave ausente ou com tamanho errado): mensagem clara e código de saída 1, sem iniciar conexão.

## 2. `npm run whatsapp:link -- <número> [--dono <provedor:conta>]`

Cadastra o número pessoal do usuário na conta `whatsapp` dele (RF-03).

| Argumento | Regra |
|-----------|-------|
| `<número>` | formato internacional, com ou sem `+`, espaços, parênteses e hífens (ex.: `+55 11 98888-7777`); normalizado para E.164 com o nono dígito brasileiro (D-07) |
| `--dono` | conta que identifica o usuário dono, como no `import`; padrão `fake:fake-operator` |

Saída de sucesso, com o número mascarado:

```
Número cadastrado: +55 11 9****-**77 (conta WhatsApp ativa)
Conversas importadas nesta conta: 1
```

Erros (código de saída 1):

| Situação | Mensagem |
|----------|----------|
| Número inválido | `Número inválido. Use o formato internacional, ex.: +55 11 98888-7777.` |
| Dono não encontrado | `Dono não encontrado: <provedor:conta>.` |
| Número de outro usuário | `Este número já está cadastrado.` (não revela quem) |

Idempotente: repetir o mesmo cadastro não muda nada e informa "já cadastrado".
