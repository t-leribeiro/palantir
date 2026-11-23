# Interface: comando de importação

> Identificador: `002-perguntar-historico-importado`

```bash
npm run import -- <arquivo.zip|arquivo.txt> --conversa "<nome>" [--fuso <IANA>] [--formato-data dmy|mdy] [--dono <provider:conta>]
```

| Opção | Padrão | Descrição |
|-------|--------|-----------|
| `<arquivo>` | obrigatório | `.zip` exportado pelo WhatsApp ou o `.txt` de dentro dele |
| `--conversa` | obrigatório | Nome da conversa; cria ou reutiliza a fonte |
| `--fuso` | `America/Sao_Paulo` | Fuso dos horários do arquivo |
| `--formato-data` | detectado | Necessário só em arquivos en com datas ambíguas |
| `--dono` | `fake:fake-operator` | Conta que identifica o dono do espaço |

## Saída (relatório)

```
Conversa: Comunidade DevOps (fonte autorizada)
Período: 01/09/2026 a 22/11/2026
Mensagens importadas: 1.284
Já existentes (reimportação): 0
Mensagens de sistema ignoradas: 37
Mídias encontradas (tratadas na S4): 112
Linhas não reconhecidas: 0
A indexação roda no worker: as mensagens ficam pesquisáveis em instantes.
```

## Erros (código de saída 1, nada é gravado)

| Situação | Mensagem |
|----------|----------|
| Arquivo inexistente | `Arquivo não encontrado: <caminho>` |
| ZIP sem `.txt` | `O ZIP não contém o .txt da conversa exportada.` |
| ZIP inseguro | `Arquivo recusado por segurança: <motivo>` (caminho fora da pasta, compressão > 100:1, tamanho > 2 GB) |
| Formato não reconhecido | `Formato não reconhecido (padrão encontrado: NN/NN/NNNN NN:NN …). Nada foi importado.` |
| Data ambígua | `Datas ambíguas (dia e mês ≤ 12). Informe --formato-data dmy ou mdy.` |
| Dono inexistente | `Conta dona não encontrada: <provider:conta>. Rode npm run seed.` |
