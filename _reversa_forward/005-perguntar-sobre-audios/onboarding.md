# Onboarding: perguntar sobre o que foi dito em áudios (S4)

Roteiro para testar a fatia pela primeira vez, partindo de uma máquina sem as fatias anteriores rodadas. Não depende dos guias da S1, da S2 nem da S3: tudo o que é preciso está aqui.

Tempo estimado:
- cerca de 1 h de transcrição manual para a medição (passo 4);
- cerca de 30 min para o resto;
- mais o tempo da máquina transcrevendo os 158 áudios do T3, em segundo plano.

## Antes de começar

- **Docker Desktop** aberto, com pelo menos 8 GB de memória para o Docker (Settings → Resources) e ~10 GB livres em disco. O motor de transcrição é uma imagem de ~3 GB, e os três modelos da medição somam ~4 GB.
- **Node 22 ativo:** `node --version` deve mostrar `v22`. Com nvm no Windows: `nvm use 22.23.5`. Com Node 18, os comandos falham com `bad option: --env-file-if-exists`.
- **PowerShell:**
  - se aparecer "a execução de scripts foi desabilitada", rode uma vez `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, ou use `npm.cmd` no lugar de `npm`;
  - para os acentos saírem certos: `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`.
- **Export com áudios:** o do T3, em `exports/export-t3.zip` (fora do git). Ele precisa ter sido exportado **com mídias** (Mais opções → Exportar conversa → Incluir mídia).
- **Para a parte ao vivo:**
  - o celular com o chip do agente, membro de um grupo de teste cujos participantes consentiram com a captura;
  - o seu celular pessoal, também no grupo.
- **Um player de áudio** que abra `.opus`. O navegador serve: arraste o arquivo para uma aba.

São três terminais:
- **canal:** `dev:whatsapp`;
- **worker:** `dev:worker`, que transcreve e torna pesquisável;
- **livre:** para os comandos.

## 1. Preparar o ambiente

```bash
npm install
npm run setup        # sobe Docker, observabilidade e o motor de transcrição; gera ou preserva o .env (inclui PALANTIR_MEDIA_KEY)
npm run db:migrate   # cria as tabelas, inclusive as de mídia (0007)
```

Confira o motor: `curl http://127.0.0.1:8090/health` deve responder 200.

No `.env`, para a parte ao vivo:
- `PALANTIR_WHATSAPP_ENABLED=true`
- `PALANTIR_WHATSAPP_CAPTURE=agent`
- `PALANTIR_MEDIA_STORE_KINDS=audio`: só áudios são guardados.

## 2. Cadastrar o seu número (se ainda não fez)

```bash
npm run whatsapp:link -- "+55 11 9XXXX-XXXX"
```

## 3. Baixar os modelos candidatos

```bash
npm run transcricao:modelos -- Systran/faster-whisper-small Systran/faster-whisper-medium <id do large-v3-turbo>
```

O id do `large-v3-turbo` fica registrado nas notas de execução do `actions.md`, depois da verificação do motor.

## 4. Medir e escolher o modelo

1. Prepare os áudios reais:
   ```bash
   npm run eval:transcricao -- preparar exports/export-t3.zip --quantos 20
   ```
2. Abra `exports/medicao/real/LEIA-ME.txt` e siga as regras. Ouça cada `NN.opus` e escreva o que ouvir no `NN.txt` correspondente. Esses arquivos ficam só na sua máquina.
3. Baixe a amostra pública (621 MB, uma vez):
   ```bash
   npm run eval:transcricao -- fleurs --quantos 50
   ```
4. Meça:
   ```bash
   npm run eval:transcricao -- medir --modelos Systran/faster-whisper-small,Systran/faster-whisper-medium,<id do turbo>
   ```
5. A tabela mostra, por modelo e conjunto, o WER, o tempo real e a memória, e aponta o recomendado: o mais preciso com WER ≤ 20% e tempo real ≤ 0,5. Coloque o escolhido no `.env`: `PALANTIR_TRANSCRIBER_MODEL=<id>`.

**O que você deve ver:** a medição roda sem mostrar nenhum trecho de fala, só números. Mande a tabela para o registro da decisão (ADR-0010).

## 5. Subir worker e canal

1. Terminal do **worker**: `npm run dev:worker`. No log, procure "transcrição: motor openai-compatible, modelo <id>, concorrência 1".
2. Terminal do **canal**: `npm run dev:whatsapp`. Se a sessão existir, conecta sem QR. Senão, leia o QR com o celular do chip (Aparelhos conectados → Conectar um aparelho).

## 6. Importar o T3 com os áudios

```bash
npm run import -- exports/export-t3.zip --conversa "T3"
```

**O que você deve ver no relatório:**
- `Áudios vinculados: 158`;
- `Áudios na fila de transcrição: 158`;
- se o T3 já tinha sido importado antes, o resto como "Já existentes".

Abra o Grafana (`http://localhost:3000`), painel **Mídia**: a fila começa em 158 e desce. O painel também mostra o tempo real por áudio e a previsão de término. Você pode seguir para o passo 7 com a fila ainda descendo: o que já foi transcrito já é pesquisável.

## 7. Perguntar sobre um áudio importado

Escolha uma palavra que você sabe que foi falada num áudio do T3. Um dos que você transcreveu no passo 4 serve. Do celular pessoal, em mensagem direta ao chip:

| Você manda | Você deve ver |
|------------|---------------|
| `em qual áudio falaram de <palavra>?` | `1. <autor> em T3, <data>, áudio de m:ss, aos m:ss: “…trecho…” [1]` |
| A mesma pergunta com uma palavra que não está em áudio nenhum | `Não encontrei evidências suficientes.` |
| Um áudio, direto ao chip | O aviso de "só texto" (áudio como pergunta fica para a S8) |

Abra o áudio citado no celular, no grupo, e vá ao ponto indicado: a palavra está ali, com margem de alguns segundos.

## 8. Áudio ao vivo no grupo autorizado

Se o grupo de teste ainda não está autorizado:

```bash
npm run whatsapp:grupos
npm run whatsapp:grupos -- autorizar <número da linha> --consentimento "<como e quando os participantes foram avisados>"
```

| Você faz | Você deve ver |
|----------|---------------|
| No grupo, do seu celular, um áudio de ~30 s dizendo uma palavra incomum (ex.: "Kubernetes") | Nada no grupo (o número nunca escreve lá); no painel **Mídia**, 1 áudio guardado e transcrito em menos de 1 min |
| ~2 min depois, em mensagem direta ao chip: `em qual áudio falaram de Kubernetes?` | A citação do seu áudio, com o grupo, a data e o ponto do trecho |
| Um áudio num grupo **não** autorizado | Nada baixado nem guardado |

## 9. (Opcional) Reconciliação do mesmo áudio

1. Com o áudio do passo 8 já capturado, exporte o grupo de teste **com mídias** e importe com o mesmo `--conversa` usado na autorização.
2. **O que você deve ver:**
   - o relatório conta o áudio em "Reconciliadas com a captura ao vivo";
   - a pergunta do passo 8 recebe **uma** citação, não duas.

Se aparecerem duas citações, o arquivo do export difere do baixado ao vivo (risco R-02). Anote para o registro do bug.

## 10. Conferir as garantias

- **Logs limpos:** no Grafana (Explore → Loki), procure uma palavra que você falou no áudio, seu número e o nome `PTT-`. Nada deve aparecer.
- **Bucket privado:** `curl http://127.0.0.1:8333/palantir-media/` responde 403 (sem credencial, nada é listado).
- **Áudio cifrado:** `npm run media:conferir` sorteia um objeto do bucket e mostra só se o conteúdo gravado é ilegível sem a chave (cabeçalho de versão + cifra) e se decifra com a chave do `.env`. Não mostra nem toca o áudio.
- **Pausar a transcrição:** `PALANTIR_TRANSCRIPTION=off` no `.env` e reinicie o worker. Importe algo com áudios: eles ficam guardados e pendentes, e as perguntas sobre texto continuam respondidas. Volte para `on` e a fila retoma.
- **Reimportar:** rode o passo 6 de novo. Nada novo entra, tudo aparece como "Já existentes".

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---------|----------------|-------------|
| `curl :8090/health` não responde | o motor não subiu ou ainda está iniciando | `docker ps`, procure `palantir-transcriber`; rode `npm run setup` de novo |
| "modelo não encontrado" no worker ou na medição | o modelo não foi baixado | `npm run transcricao:modelos -- <id>` |
| A fila não desce | worker parado, ou `PALANTIR_TRANSCRIPTION=off` | suba o `dev:worker`; confira o `.env` |
| Muito lento (tempo real > 1) | modelo grande demais para a CPU, ou Docker com pouca CPU | troque para um modelo menor no `.env`; aumente a CPU do Docker |
| `Áudios vinculados: 0` com um export que tem áudios | export feito sem mídias, ou ZIP incompleto | exporte de novo incluindo mídia |
| A citação aponta o áudio certo, mas o ponto está alguns segundos antes | o trecho citado é um bloco de frases, e o ponto é o início do bloco | esperado; o trecho mostra as palavras |
| A pergunta não encontra o áudio | transcrição ainda na fila, palavra transcrita de outro jeito, ou palavra diferente | espere a fila; tente uma grafia próxima (busca por palavras até a S6) |
| "Falta a chave de mídia no .env" | `.env` anterior à S4 | `npm run setup` (preserva as chaves existentes e gera a nova) |
