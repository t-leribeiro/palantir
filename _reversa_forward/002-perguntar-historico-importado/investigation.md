# Investigation: Perguntar ao histórico importado (fatia S1)

> Identificador: `002-perguntar-historico-importado`

## Formatos de exportação do WhatsApp (amostras sintéticas a criar em T002)

| Origem | Exemplo de linha |
|--------|------------------|
| Android pt-BR | `10/11/2026 10:00 - Diego: Recomendo o Temporal` |
| Android en | `11/10/26, 10:00 AM - Diego: I recommend Temporal` |
| iOS pt-BR | `[10/11/2026, 10:00:15] Diego: Recomendo o Temporal` (com U+200E em linhas de mídia e sistema) |
| iOS en | `[11/10/26, 10:00:15 AM] Diego: I recommend Temporal` |

Mídia: Android `<Mídia oculta>` / `<Media omitted>` / `PTT-…opus (arquivo anexado)`; iOS `‎<anexado: 00000012-AUDIO-….opus>` / `‎<attached: …>`.
Sistema: aviso de criptografia, "entrou usando o link", "saiu", "adicionou", "mudou o nome do grupo", "Esta mensagem foi apagada" / "This message was deleted".

## Bibliotecas avaliadas para ZIP

| Opção | Streaming | Valida nomes de entrada | Veredito |
|-------|-----------|-------------------------|----------|
| `yauzl` 3.4.0 | sim | sim (rejeita absolutos e `..`) | Escolhida (D-02) |
| `adm-zip` | não (carrega tudo) | parcial | Descartada |
| `unzipper` | sim | não por padrão | Descartada |

`yazl` 3.3.1 entra só como dependência de desenvolvimento, para gerar ZIPs de teste (inclusive maliciosos).

## Conversão de fuso sem biblioteca

`Intl.DateTimeFormat` com `timeZone` dá o deslocamento de um instante; uma iteração de correção resolve horários perto de mudança de horário de verão. Coberto por testes com `America/Sao_Paulo`, `UTC` e `America/New_York`.
