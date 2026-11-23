# Roadmap: Perguntar ao histórico importado (fatia S1)

> Identificador: `002-perguntar-historico-importado`
> Data: `2026-11-23`
> Requirements: `_reversa_forward/002-perguntar-historico-importado/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

Delta sobre o walking skeleton (adendo `_reversa_sdd/addenda/001-walking-skeleton.md`). Um novo adaptador, `src/channels/whatsapp-export/`, lê o `.zip` ou o `.txt` exportado em streaming, interpreta as linhas dos formatos Android e iOS (pt-BR e en) e entrega cada mensagem ao **mesmo** caso de uso `IngestMessage` já usado pelo canal fake, com `captureMethod=export_import` e uma chave de importação determinística. O contrato do canal ganha o campo opcional `source.importKey` (versão 1.1.0, mudança aditiva), e a ingestão passa a deduplicar por ele usando o índice `messages(source_id, import_key)` que já existe. A conversa importada vira uma fonte autorizada na conta `whatsapp` do operador, criada sem número (esclarecimento de 2026-11-23). Um comando `npm run import` amarra tudo e imprime o relatório. A busca, o agente e o canal de teste não mudam.

## 2. Princípios aplicados

| Princípio | Como a feature se relaciona | Status |
|-----------|------------------------------|--------|
| WhatsApp-first, not only | Formato do WhatsApp só no adaptador; o núcleo recebe `CanonicalMessage` | respeita |
| Security / Local First | ZIP lido localmente, com proteções contra zip bomb e path traversal; arquivo original não é copiado | respeita |
| API / Documentation First | Contrato 1.1.0 publicado antes do código (T001) | respeita |
| TDD, KISS, YAGNI | Importação síncrona e idempotente; assíncrona e retomável ficam fora (YAGNI) | respeita |

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | Adaptador em `src/channels/whatsapp-export/`: `parse.ts` (funções puras de linha), `zip.ts` (leitura segura), `importer.ts` (orquestra e gera o relatório) | ADR-0004: formato do provedor fora do núcleo | Parser dentro da ingestão | 🟢 |
| D-02 | Leitura de ZIP com `yauzl` 3.4 em streaming; antes de extrair, recusa entradas com caminho absoluto ou `..`, taxa de compressão > 100:1, tamanho total > 2 GB, e ZIP sem `.txt` | RF-10; yauzl valida nomes e tamanhos e não extrai para o disco | `adm-zip` (carrega tudo na memória), `unzipper` | 🟡 |
| D-03 | Uma expressão regular por formato: Android (`DD/MM/AAAA HH:MM - Autor: texto`, en com `, ` e AM/PM) e iOS (`[DD/MM/AAAA, HH:MM:SS] Autor: texto`, com marca invisível U+200E). Linha que não abre mensagem é continuação da anterior (multilinha) | RF-02 | Biblioteca de parsing de terceiros (pouco mantidas, sem iOS pt-BR) | 🟡 |
| D-04 | Mensagens de sistema reconhecidas por: ausência de "Autor:" e frases conhecidas em pt-BR/en (criptografia, entrou, saiu, adicionou, mudou o nome, mensagem apagada) | RF-04 | Lista só de frases (falha em variações) | 🟡 |
| D-05 | Ordem de data: pt-BR é dia/mês; en detecta pelo arquivo (um valor > 12 decide) e, se ambíguo, exige `--formato-data dmy|mdy` | RF-03 | Adivinhar pelo locale da máquina | 🟢 |
| D-06 | Fuso: hora local do arquivo convertida para UTC com `Intl.DateTimeFormat` (padrão `America/Sao_Paulo`, opção `--fuso`), sem dependência nova | RF-06; YAGNI | `date-fns-tz`, `luxon` | 🟡 |
| D-07 | Chave de importação = SHA-256 de (`conversa`, data/hora ISO, autor normalizado, texto normalizado, ordinal entre linhas idênticas no mesmo minuto) | RF-07 / RN-02 / RN-03; ordinal estável entre exportações que contêm o mesmo minuto | Hash sem ordinal (funde mensagens iguais) | 🟢 |
| D-08 | Contrato 1.1.0: `source.importKey` opcional, obrigatório quando `captureMethod=export_import`; `CONTRACT_VERSION` passa a 1.1.0; validador continua aceitando major 1 | Mudança aditiva (ADR-0004, RF-08 da spec do contrato) | Reaproveitar `externalMessageId` com o hash (confundiria a reconciliação da S3) | 🟢 |
| D-09 | `PgMessageStore` escolhe o alvo do `ON CONFLICT` pela chave presente: `(source_id, external_message_id)` ou `(source_id, import_key)` | Os índices parciais já existem (migração 0003) | Nova migração | 🟢 |
| D-10 | Caso de uso `EnsureImportSource` no módulo `sources`: garante a conta `provider=whatsapp` do dono (`external_account_id = unlinked:<userId>`, `status=pending`) e a fonte `authorized` com o nome da conversa | Esclarecimento 2026-11-23; conta `pending` não identifica ninguém no agente até a S2 vincular o número | Conta separada só de importação | 🟢 |
| D-11 | O dono da importação é resolvido pela conta indicada em `--dono` (padrão `fake:fake-operator`, o operador da 001) | Único usuário existente; a S2 troca para a conta WhatsApp verificada | Usuário fixo no código | 🟡 |
| D-12 | Importação síncrona, mensagem a mensagem pelo `IngestMessage`; a indexação continua assíncrona no worker | KISS; a chave torna a reimportação segura se algo falhar no meio | Job de importação retomável (fica para quando houver importação pelo WhatsApp) | 🟢 |

## 4. Premissas

| Premissa | Origem | Risco se errada |
|----------|--------|-----------------|
| O formato de exportação atual do WhatsApp segue os 4 padrões das amostras | `requirements.md#5` (RF-02) | Arquivo real não reconhecido; ajuste da expressão regular com uma amostra anonimizada na demo |
| A precisão de minuto (Android) basta para a chave e para a citação | `requirements.md#5` (RF-07) | Nenhum para a S1; a reconciliação da S3 usa janela de 60 s |

## 5. Delta arquitetural

| Componente | Arquivo de origem | Tipo de mudança | Resumo |
|------------|-------------------|-----------------|--------|
| whatsapp-export-importer | `_reversa_sdd/sdd/whatsapp-export-importer.md` | componente-novo | Adaptador de importação (só texto) |
| channel-contract | `_reversa_sdd/sdd/channel-contract.md` | contrato-alterado | 1.1.0: `source.importKey` |
| ingestion | `_reversa_sdd/sdd/ingestion.md` | regra-alterada | Deduplicação também por `import_key` (RF-03 da spec) |
| identity-and-sources | `_reversa_sdd/sdd/identity-and-sources.md` | regra-nova | Conta `whatsapp` sem número + fonte autorizada pela importação |

## 6. Delta no modelo de dados

- Nenhuma migração: `messages.import_key` e o índice único parcial já existem (migração 0003). Novos dados: uma linha em `channel_accounts` (`provider=whatsapp`, `status=pending`) por dono e uma `sources` por conversa importada.
- Detalhe em: `_reversa_forward/002-perguntar-historico-importado/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| `CanonicalMessage` 1.1.0 | esquema | `_reversa_forward/002-perguntar-historico-importado/interfaces/canonical-message-1.1.md` |
| Comando `npm run import` | CLI | `_reversa_forward/002-perguntar-historico-importado/interfaces/import-cli.md` |

## 8. Plano de migração

n/a: mudança aditiva no contrato e nenhuma migração de banco.

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Variação de formato não coberta pelas amostras | médio | média | RF-12 recusa o arquivo sem gravar; o relatório mostra o padrão (sem conteúdo) para ajuste rápido |
| ZIP malicioso | alto | baixa | D-02 com testes para cada caso |
| Dados de terceiros num grupo real | alto | média | Local-first; a demo usa um grupo escolhido pelo usuário; nada sai da máquina |

## 10. Critério de pronto

- [ ] Todas as ações do `actions.md` marcadas `[X]`
- [ ] Os 10 cenários Gherkin do `requirements.md#7` cobertos por testes verdes
- [ ] Esteira do PR verde e PR mergeado
- [ ] Roteiro de demonstração no `onboarding.md` e `docs/plano-de-fatias.md` com a S1 como ✅

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-23 | Versão inicial gerada por `/reversa-plan` | reversa |
