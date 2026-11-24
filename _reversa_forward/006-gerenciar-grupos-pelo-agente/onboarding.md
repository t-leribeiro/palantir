# Onboarding: gerenciar grupos conversando com o agente (S5)

Roteiro para testar a fatia pela primeira vez. Ele é autossuficiente e não depende dos guias da S1 à S4.

Tempo estimado: cerca de 30 min.

> ⚠️ Depois da migração desta fatia, a sua conta pessoal volta para **pendente**. O agente para de responder às suas perguntas até você mandar o código do passo 3. Isso é esperado.

## Antes de começar

- **Docker Desktop** aberto.
- **Node 22 ativo:** `node --version` deve mostrar `v22`. Com nvm no Windows: `nvm use 22.23.5`.
- **PowerShell:**
  - se os scripts estiverem bloqueados, rode `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`;
  - para os acentos: `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`.
- **Dois celulares:**
  - o do chip do agente, já pareado (sessão em `~/.palantir/whatsapp/`);
  - o seu pessoal.
- **Um grupo de teste descartável**, com o chip do agente e o seu número, cujos participantes concordaram com a captura. Ele vai ser **apagado** no passo 7. Não use o T3 nem outro grupo que você queira manter.
- **No `.env`:** `PALANTIR_WHATSAPP_ENABLED=true` e `PALANTIR_WHATSAPP_CAPTURE=agent`.

São três terminais:
- **canal:** `npm run dev:whatsapp`;
- **worker:** `node --env-file-if-exists=.env --import tsx src/main/worker.ts`, que processa as exclusões, indexa e transcreve;
- **livre:** para os comandos.

## 1. Preparar o ambiente

```bash
npm install
npm run setup         # sobe o Docker e preserva o .env
npm run db:migrate    # aplica a 0008: tabelas de gestão; a sua conta volta para pendente
npm run seed          # o canal de teste continua verificado
```

Suba o **worker** e o **canal** nos seus terminais.

## 2. Ver que a conta ficou pendente

Do seu celular, mande ao agente: `quem falou de Titanium?`

Esperado: `Sua conta ainda não foi verificada. Mande aqui o código de 6 dígitos que aparece ao rodar npm run whatsapp:link.`

## 3. Verificar a conta

```bash
npm run whatsapp:link -- "<seu número>"
```

O terminal mostra um código de 6 dígitos. Mande esse código ao agente pelo seu celular em até 10 min.

Esperado: `Conta verificada. Pode perguntar e gerenciar seus grupos por aqui.`

Para conferir as proteções, se quiser: um código errado responde `Código incorreto. Restam N tentativas.`

## 4. Listar

Mande ao agente: `grupos`

Esperado:
- a lista numerada com os grupos do chip (cerca de 55) e as conversas importadas, cada uma com o estado;
- `mais` mostra a segunda parte da lista.

Anote o número do grupo de teste descartável.

## 5. Acompanhar

1. Mande `acompanhar <número do grupo de teste>`. O agente pede a confirmação do consentimento, citando o nome do grupo.
2. Responda `confirmo`.
3. No grupo de teste, mande pelo seu celular: `teste da S5 sobre girassóis`.
4. Pergunte ao agente: `quem falou de girassóis?`. A resposta cita a sua mensagem no grupo de teste.

## 6. Pergunta citando o grupo e parar de acompanhar

1. Pergunte ao agente `no <nome do grupo de teste>, quem falou de girassóis?`. A resposta cita só esse grupo.
2. Mande `parar <nome do grupo de teste>`. O agente confirma, e a próxima mensagem no grupo não é guardada.
3. Pergunte de novo `quem falou de girassóis?`. O histórico continua aparecendo.

## 7. Apagar

1. Mande `apagar <nome do grupo de teste>`. O agente explica que é irreversível e pede `confirmo apagar <nome>`.
2. Para conferir a proteção, se quiser: responda `confirmo apagar T3`. Nada acontece, e o agente explica qual é a confirmação certa.
3. Responda `confirmo apagar <nome do grupo de teste>`. O agente responde `Apagando "…". Aviso aqui quando terminar.`
4. Em até alguns segundos, chega o aviso `Terminei de apagar "…": N mensagens e M áudios.`
5. Pergunte `quem falou de girassóis?`. A resposta é `Não encontrei evidências suficientes.`

## 8. Conferir a auditoria e a mídia

```bash
npm run auditoria       # vínculo, verificação, autorização, parada, pedido e conclusão da exclusão, sem textos
npm run media:conferir  # nenhum objeto de mídia sem fonte
```

No Grafana (http://localhost:3000, usuário `admin`; a senha sai de `terraform -chdir=infra/local output -raw grafana_admin_password`), o painel **Gestão** mostra o comando e a exclusão concluída.

## Se algo der errado

| Sintoma | O que fazer |
|---------|-------------|
| O código diz "expirado" | Rode o `whatsapp:link` de novo: sai um código novo |
| `Não sei qual é o 4` | A lista tem mais de 30 min ou mudou: mande `grupos` de novo |
| O aviso de exclusão não chega | Confira se o worker e o canal estão rodando; o aviso sai quando os dois estão no ar. `npm run auditoria` mostra se a exclusão terminou |
| A exclusão não termina | Painel "Gestão" e alerta `SourceDeletionStalled`; confira o SeaweedFS (`npm run setup`) |
| O agente não responde nada | A conta pode não estar vinculada a este número: confira o `whatsapp:link`. Remetente desconhecido recebe silêncio por design |
