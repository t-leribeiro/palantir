# Interface: CLIs de importação (áudios) e de medição

> Feature `005-perguntar-sobre-audios` · RF-01, RF-02, RF-11; D-17 e D-19 do roadmap

## 1. `npm run import` (relatório)

A sintaxe não muda: `npm run import -- <arquivo.zip|.txt> --conversa "<nome>"`. O relatório ganha estas linhas, mostradas só quando maiores que zero:

```
Áudios vinculados: 158
Áudios ausentes no export: 0
Áudios com legenda (só o texto entrou): 0
Áudios na fila de transcrição: 158 (acompanhe no painel "Mídia")
```

"Mídias encontradas (tratadas na S4)" passa a ser "Outras mídias encontradas (não guardadas): N", com N sem os áudios.

Erros novos (saída 1, sem nome de arquivo):

| Situação | Mensagem |
|----------|----------|
| Armazenamento fora do ar | "Não consegui gravar os áudios: o armazenamento local não respondeu. Rode `npm run setup` e tente de novo. Nada foi importado." |
| `PALANTIR_MEDIA_KEY` ausente ou inválida | "Falta a chave de mídia no .env. Rode `npm run setup`." |

A importação continua tudo ou nada nas mensagens. Os objetos já gravados de uma tentativa que falhou ficam no bucket e são reaproveitados na próxima, porque a chave é pelo conteúdo.

## 2. `npm run eval:transcricao`

Tudo o que o comando escreve fica em `exports/medicao/`, fora do git. A saída nunca mostra texto, transcrito ou de referência, nem nome de arquivo original.

### `preparar`

```
npm run eval:transcricao -- preparar <export.zip> [--quantos 20] [--semente 1]
```

O comando sorteia, de forma determinística pela semente, áudios de 10 a 120 s. A seleção é estratificada por mês, para não concentrar num dia só. Ele grava:
- `exports/medicao/real/01.opus`, `02.opus` e assim por diante;
- `01.txt`, `02.txt` e assim por diante, vazios;
- `LEIA-ME.txt`, com as regras.

Regras do `LEIA-ME.txt`:
- escreva o que ouvir, palavra por palavra, sem corrigir a fala;
- ignore hesitações ("é…", "hum");
- escreva os números como foram falados;
- marque o trecho que não entender com `[?]`, que fica fora do WER.

Saída: `Preparados 20 áudios (total 18 min). Transcreva cada NN.txt e rode "medir".`

Se o comando rodar de novo com arquivos `.txt` já preenchidos, ele não sobrescreve: avisa e para.

### `fleurs`

```
npm run eval:transcricao -- fleurs [--quantos 50] [--semente 1]
```

O comando baixa `data/pt_br/test.tsv` e `audio/test.tar.gz` (621 MB, uma vez; o download é retomado se cair), confere o tamanho e escolhe as frases pela semente. Grava em `exports/medicao/fleurs/`.

### `medir`

```
npm run eval:transcricao -- medir --modelos <id>[,<id>...] [--conjuntos real,fleurs]
```

Para cada modelo e conjunto, transcreve pela porta `Transcriber` e calcula:
- **WER:** distância de edição por palavras sobre o total da referência, depois da normalização NFC, minúsculas, sem pontuação, espaços colapsados e sem trechos `[?]`;
- **fator de tempo real:** tempo de transcrição dividido pela duração do áudio;
- **pico de memória do container:** amostra do `docker stats` a cada 2 s.

Saída (exemplo de formato):

```
Modelo                          Conjunto  Áudios  Duração  WER     Tempo real  Memória
Systran/faster-whisper-small    real      20      18:04    14,2%   0,31        1,1 GB
Systran/faster-whisper-small    fleurs    50      07:40    9,8%    0,29        1,1 GB
...
Recomendado: Systran/faster-whisper-medium (mais preciso com WER ≤ 20% e tempo real ≤ 0,5)
```

O resultado também é gravado em `exports/medicao/resultado-<data>.json`, só com números, para a ADR.

| Situação | Comportamento |
|----------|---------------|
| `.txt` vazio | O áudio fica fora do conjunto e o comando avisa quantos ficaram |
| Modelo não baixado | Erro com a dica `npm run transcricao:modelos -- <id>` |
| Motor fora do ar | Erro com a dica `npm run setup` |

## 3. `npm run transcricao:modelos`

```
npm run transcricao:modelos -- <id> [<id>...]
```

Baixa os modelos no motor local e mostra só o id, o tamanho e o tempo gasto. É idempotente.

## 4. `npm run media:conferir`

```
npm run media:conferir
```

Sorteia até 3 objetos do bucket e confere, para cada um, sem mostrar nem tocar o conteúdo:
- o cabeçalho de versão da cifra está presente e o conteúdo não é um arquivo de áudio legível;
- a chave do `.env` decifra o objeto;
- o SHA-256 decifrado bate com o registrado em `attachments`.

Saída: `3 objetos conferidos: cifrados, decifráveis com a chave atual, hash confere.` Se o bucket estiver vazio, o comando avisa. Se algo falhar, a saída diz qual verificação falhou, sem a chave do objeto.
