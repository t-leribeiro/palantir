# Investigation: Gerenciar grupos conversando com o agente (fatia S5)

> Identificador: `006-gerenciar-grupos-pelo-agente`
> Data: `2026-11-24`

## 1. O que já existe e é reaproveitado

| Peça | Onde | Uso na S5 |
|------|------|-----------|
| `createCaptureAdmin` (listar, autorizar com consentimento, revogar, ligar à importação) | `src/modules/sources/application/capture-authorization.ts` (S3) | Fica dentro do serviço de gestão (D-03) |
| `sources.status = 'deleting'` | migração 0002 | Esconde a fonte da busca (`pg-search-index.ts`), recusa a importação (`ensure-import-source.ts`) e a ingestão (`decideIngestion`) |
| FKs `ON DELETE CASCADE` | migrações 0003 a 0007 | Cascata do `DELETE FROM sources` |
| Chave do objeto `space/source/sha256` | S4, D-04 | Purga por prefixo, sem afetar outra fonte |
| `sendReply(destinationAccountId, reply)` | contrato do canal 1.3.0 | Aviso de conclusão sem mudar o contrato |
| Recibos de entrada | `agent_inbound_receipts` (S2) | A mensagem reentregue não confirma duas vezes |
| `questionScope` e `SearchRequest.kind` | E001 da S4 | Base do filtro por grupo (D-14) |
| Processadores que ignoram o que sumiu | `process-attachment.ts`, `index-message.ts` | Jobs órfãos terminam `skipped` (D-09) |

## 2. Alternativas avaliadas

### 2.1 Reconhecer os comandos

- **Palavras fixas (escolhida):** previsível, sem custo e testável com tabela de casos. É o padrão da ajuda (S2) e da E001 (S4).
- **LLM classificando a intenção:** é a proposta da S9, mas nenhum LLM foi escolhido ainda (OQ-01 do agente). Para ações destrutivas, previsibilidade vale mais que flexibilidade.

### 2.2 Estado da conversa

- **Tabela no Postgres (escolhida):** sobrevive ao reinício, vale para mais de um processo e a expiração é uma comparação de data.
- **Memória do processo:** perde a confirmação num reinício e não é testável no E2E entre processos.
- **`AgentSession` completa da spec (10 trocas, 2 h):** maior do que esta fatia precisa; fica para a S7 ("mostra a 2") e a S9.

### 2.3 Exclusão

- **Duas etapas, com marcação síncrona e job assíncrono (escolhida):** a resposta é imediata, a fonte some da busca na hora e o trabalho pesado tem retentativa.
- **`DELETE` síncrono:** 10.000 mensagens com cascata custam segundos. Sem a mídia, sobra arquivo; com a mídia, o armazenamento fora do ar trava a resposta.
- **Apagar em lotes de mensagens:** desnecessário no volume da v0.1; a cascata de uma fonte numa transação é aceitável. Fica como plano B se a medição passar de 5 min.

**S3 `DeleteObjects`:** até 1.000 chaves por chamada, e é idempotente (apagar chave inexistente não é erro). `ListObjectsV2` pagina por `ContinuationToken`. O SeaweedFS implementa os dois na API S3.

### 2.4 Retentativa da exclusão por até 24 h (EC-03 da spec)

O pg-boss já oferece `retryLimit`, `retryDelay` e `retryBackoff`. Com 30 s e recuo exponencial, 12 tentativas somam cerca de 34 h. É a forma mais simples de cumprir "até 24 h, depois alertar" sem agendador próprio. O alerta de 30 min avisa bem antes da fila morta.

### 2.5 Verificação de posse

- **Código do terminal para o agente (escolhida no esclarecimento):** prova que quem opera o terminal controla o número. O agente não manda mensagem espontânea, o que reduz o risco de bloqueio (ADR-0009).
- **Código do agente para o número:** é o padrão de SMS, mas exige mandar mensagem a quem não falou com o agente.
- **Hash:** um código de 6 dígitos tem 10⁶ combinações. Com 5 tentativas e 10 min de validade, a chance de acerto online é de 5 em 1 milhão. SHA-256 com sal basta: quem lê o banco já tem acesso a tudo, e um KDF lento não muda esse quadro.

### 2.6 Base legal (decidida no esclarecimento)

Consentimento declarado por grupo (LGPD, art. 7º, I), como na S3. As alternativas registradas, que não foram adotadas:
- a exclusão do uso particular e não econômico (art. 4º, I);
- o legítimo interesse (art. 7º, IX).

O direito de eliminação (art. 18, VI) é atendido pela exclusão desta fatia: o dono apaga a pedido de quem quer que seja. Este documento não é parecer jurídico.

### 2.7 Filtro por grupo na pergunta

- **Nome completo normalizado, o mais longo (escolhida):** poucos falsos positivos. "Contas" sozinho não vira filtro de "Contas da Casa".
- **Trecho do nome:** atrapalharia perguntas comuns ("quem falou das contas?").
- **Extração por LLM:** S9.

## 3. Referências

- LGPD, Lei 13.709/2018: arts. 4º, 7º e 18. https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- pg-boss, opções de retentativa (`retryLimit`, `retryDelay`, `retryBackoff`, `deadLetter`): https://timgit.github.io/pg-boss/
- Amazon S3 `DeleteObjects` e `ListObjectsV2`: https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html
- ADR-0009, adaptador do WhatsApp não oficial e risco de bloqueio: `docs/adr/0009-adaptador-whatsapp-nao-oficial.md`
- Adendos `_reversa_sdd/addenda/003` (vínculo sem verificação), `004` (captura e consentimento) e `005` (mídia por fonte).
