# Spec: whatsapp-export-importer

**Versão:** 1.0
**Status:** Rascunho
**Autor:** reversa-spec-sdd
**Data:** 2026-11-22
**Reviewers:** N/A

> Selo 🟡 PLANEJADO em todos os itens. Fonte: `_reversa_sdd/prd.md`.

---

## 1. Resumo

🟡 Importa o arquivo ZIP gerado pela função "Exportar conversa" do WhatsApp (texto e mídias), interpreta o `.txt` da conversa e produz `CanonicalMessage`s com `captureMethod=export_import`. É o caminho para trazer o histórico antigo que a captura ao vivo não recupera.

---

## 2. Contexto e Motivação

**Problema:**
🟡 A captura ao vivo só vê mensagens novas. O conhecimento que motivou o produto está no histórico antigo dos grupos, inclusive em áudios.

**Evidências:**
🟡 Pedido explícito do usuário nas jornadas das três personas (`personas.md`); PRD seção 4 (importação de histórico) e critério de aceite "P1 (importação)".

**Por que agora:**
🟡 Sem histórico, a base nasce vazia e o conjunto de avaliação de 30 perguntas não pode ser montado.

---

## 3. Goals (Objetivos)

- [ ] 🟡 G-01: Importar um ZIP exportado e tornar mensagens e mídias pesquisáveis.
- [ ] 🟡 G-02: Interpretar corretamente data, hora, autor e conteúdo em exportações em português e inglês, Android e iOS.
- [ ] 🟡 G-03: Reimportar o mesmo arquivo não duplica mensagens.

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| 🟡 Linhas de mensagem interpretadas corretamente no corpus de teste | n/a | ≥ 99% | v0.1 |
| 🟡 Mensagens duplicadas após reimportar o mesmo ZIP | n/a | 0 | v0.1 |
| 🟡 Tempo de importação de 10.000 mensagens sem mídia | n/a | ≤ 2 min | v0.1 |

---

## 4. Non-Goals (Fora do Escopo)

- 🟡 NG-01: Importar backups criptografados do WhatsApp (Google Drive, iCloud, `msgstore.db`).
- 🟡 NG-02: Importar exportações de outros aplicativos (Telegram, Slack) na v0.1; cada um será outro importador.
- 🟡 NG-03: Reconstruir mensagens apagadas ou mídias omitidas na exportação ("<Mídia oculta>").
- 🟡 NG-04: Interface web de upload; na v0.1 o arquivo entra por CLI/API ou enviado como documento ao agente.

---

## 5. Usuários e Personas

**Usuário primário:** 🟡 P1 e P2, que exportam conversas no celular para ter o histórico no Palantír.
**Usuário secundário:** 🟡 Tech lead da P3 (fase seguinte), importando o grupo de suporte.

**Jornada atual (sem a feature):**
🟡 O histórico antigo só existe no celular; pesquisar um áudio antigo exige ouvi-los um por um.

**Jornada futura (com a feature):**
1. 🟡 O usuário exporta a conversa com mídias no WhatsApp.
2. 🟡 O usuário envia o ZIP ao Palantír e indica a fonte correspondente.
3. 🟡 O sistema importa e informa quantas mensagens e mídias entraram.
4. 🟡 O usuário pergunta ao agente sobre o histórico importado.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | 🟡 O sistema deve aceitar um ZIP de até 2 GB contendo um `.txt` de conversa e arquivos de mídia. | Must | 🟡 ZIP válido é aceito; ZIP sem `.txt` é rejeitado com mensagem explicativa. |
| RF-02 | 🟡 O sistema deve interpretar os formatos de linha de Android e iOS, em pt-BR e en, incluindo mensagens multilinha. | Must | 🟡 Corpus de teste com os 4 formatos é interpretado com ≥ 99% das linhas corretas. |
| RF-03 | 🟡 O sistema deve associar referências a anexos no texto (ex.: `PTT-20251101-WA0003.opus (arquivo anexado)`) aos arquivos do ZIP. | Must | 🟡 Áudio referenciado é vinculado à mensagem e enviado ao storage. |
| RF-04 | 🟡 O sistema deve exigir que o usuário indique a `Source` alvo (existente ou nova) do seu espaço, autorizada para importação. | Must | 🟡 Importar para fonte de outro espaço ou não autorizada é rejeitado. |
| RF-05 | 🟡 O sistema deve gerar para cada mensagem uma chave de importação determinística: hash de (`source_id`, timestamp, autor, conteúdo normalizado, ordinal no mesmo minuto). | Must | 🟡 Reimportar o mesmo ZIP produz as mesmas chaves e zero mensagens novas. |
| RF-06 | 🟡 O sistema deve converter cada mensagem em `CanonicalMessage` com `captureMethod=export_import` e `externalMessageId` ausente. | Must | 🟡 Ingestão recebe mensagens válidas pelo esquema do contrato. |
| RF-07 | 🟡 O sistema deve ignorar mensagens de sistema (entradas, saídas, mudança de nome do grupo, aviso de criptografia). | Should | 🟡 Linhas de sistema não aparecem como mensagens pesquisáveis. |
| RF-08 | 🟡 O sistema deve permitir informar o fuso horário da exportação (padrão: America/Sao_Paulo). | Must | 🟡 Timestamps gravados com o fuso informado. |
| RF-09 | 🟡 O sistema deve gerar um relatório da importação: mensagens importadas, ignoradas, duplicadas, mídias vinculadas e mídias ausentes. | Must | 🟡 Relatório retornado ao fim e enviado ao usuário pelo agente quando a importação vier por lá. |
| RF-10 | 🟡 O sistema deve processar a importação de forma assíncrona e retomável a partir da última mensagem processada. | Should | 🟡 Interromper a importação no meio e reiniciar conclui sem duplicar. |

### 6.2 Fluxo Principal (Happy Path)

1. 🟡 O usuário envia o ZIP e indica a fonte alvo.
2. 🟡 O sistema valida o arquivo e a autorização da fonte e cria um job de importação.
3. 🟡 O sistema interpreta o `.txt`, vincula as mídias e gera as chaves de importação.
4. 🟡 O sistema envia cada `CanonicalMessage` para a ingestão e as mídias para o storage.
5. 🟡 O sistema conclui o job e envia o relatório ao usuário.
6. 🟡 Resultado: o histórico fica pesquisável e os áudios entram na fila de transcrição.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Exportação sem mídia:**
1. 🟡 O ZIP contém só o `.txt`; o sistema importa os textos e registra as mídias como `unavailable`.

**Fluxo Alternativo B — Importação via agente:**
1. 🟡 O usuário envia o ZIP como documento ao número do agente; o agente pergunta qual fonte corresponde e dispara o job.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | 🟡 Performance | 🟡 10.000 mensagens sem mídia em ≤ 2 min | 🟡 Máquina local de desenvolvimento. |
| RNF-02 | 🟡 Robustez | 🟡 Processamento em streaming | 🟡 Não carregar o ZIP inteiro em memória. |
| RNF-03 | 🟡 Segurança | 🟡 Proteção contra zip bomb e path traversal | 🟡 Limite de razão de compressão 100:1 e de nomes de arquivo. |

---

## 8. Design e Interface

**Componentes afetados:** 🟡 Endpoint/CLI de importação, worker de importação, comando do agente para documentos ZIP.

**Comportamento esperado:**
🟡 A importação é um job com estados `queued`, `running`, `completed`, `failed`, consultável pelo usuário.

**Estados da UI:**
- 🟡 Estado vazio: "Nenhuma importação feita. Exporte uma conversa com mídias e envie o ZIP."
- 🟡 Estado de carregamento: "Importando: 3.200 de 10.000 mensagens."
- 🟡 Estado de erro: "Não reconheci o formato deste arquivo; nada foi importado."
- 🟡 Estado de sucesso: relatório com contagens (RF-09).

---

## 9. Modelo de Dados

```
ImportJob { id: uuid, space_id: uuid, source_id: uuid, status: enum(queued, running, completed, failed),
            timezone: text, last_line_processed: int, stats: jsonb, error: text?, created_at: timestamptz }
```

**Migrações necessárias:** 🟡 Sim, tabela `ImportJob`.

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| 🟡 Formato de exportação do WhatsApp | Obrigatória | 🟡 Formato novo não reconhecido: job falha com erro explícito e amostra da linha (sem conteúdo pessoal no log). |
| 🟡 Object storage | Obrigatória | 🟡 Job pausa e é retomado. |
| 🟡 `ingestion` e `identity-and-sources` | Obrigatória | 🟡 Job permanece `queued` até a dependência voltar. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| 🟡 EC-01: Formato de data não reconhecido | 🟡 Idioma ou versão do app diferente | 🟡 Falhar o job com "formato não reconhecido" e o padrão detectado; nada é gravado. |
| 🟡 EC-02: Mídia referenciada ausente no ZIP | 🟡 Exportação sem mídia ou arquivo faltando | 🟡 Importar a mensagem com anexo `unavailable` e contar no relatório. |
| 🟡 EC-03: Mesma mensagem já capturada ao vivo | 🟡 Sobreposição de período | 🟡 Ingestão aplica a regra de reconciliação (ver `ingestion`); relatório conta como duplicada. |
| 🟡 EC-04: ZIP malicioso | 🟡 Zip bomb ou caminho `../` | 🟡 Rejeitar o arquivo inteiro com erro de segurança. |
| 🟡 EC-05: Falha do storage durante a importação | 🟡 Timeout ou indisponível | 🟡 Pausar o job, retry com backoff e retomar de `last_line_processed`. |
| 🟡 EC-06: Autor com nome trocado ao longo do tempo | 🟡 Contato renomeado | 🟡 Gravar o nome exibido em cada mensagem; sem unificação automática na v0.1. |

---

## 12. Segurança e Privacidade

- **Autenticação:** 🟡 Usuário identificado pela conta de canal ou pela API autenticada.
- **Autorização:** 🟡 Só importa para fontes autorizadas do próprio espaço.
- **Dados sensíveis:** 🟡 O ZIP contém conversas inteiras; o arquivo original é apagado após a importação (padrão) ou retido apenas se o usuário pedir.
- **Auditoria:** 🟡 Registrar quem importou, fonte, quantidade e horário.

---

## 13. Plano de Rollout

- **Estratégia:** 🟡 Habilitado desde a v0.1, testado com corpus de exportações reais anonimizadas.
- **Como reverter (rollback):** 🟡 Excluir a fonte (cascata de `identity-and-sources`) ou o job com suas mensagens.
- **Monitoramento pós-deploy:** 🟡 Taxa de linhas não interpretadas e jobs com falha.

---

## 14. Open Questions

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | 🟡 Exportações com limite de mensagens (o WhatsApp limita a quantidade em conversas longas) exigem importações parciais encadeadas? | Médio | Leandro | v0.1 |
| OQ-02 | 🟡 Como montar o corpus de teste sem expor dados reais de terceiros? | Médio | Leandro | Antes dos testes |

---

## 15. Decisões Tomadas (Decision Log)

| Decisão | Alternativas consideradas | Racional |
|---------|--------------------------|---------|
| 🟡 Chave de importação determinística por hash | 🟡 Id aleatório por linha | 🟡 Reimportação idempotente sem `externalMessageId`. |
| 🟡 Importador como adaptador separado | 🟡 Importação dentro da ingestão | 🟡 O formato é específico do WhatsApp; o núcleo segue neutro. |

---

## Apêndice

### Referências
- 🟡 `_reversa_sdd/prd.md` seções 4, 7, 9
- 🟡 `_reversa_sdd/personas.md` (passo de importação nas três jornadas)

### Histórico de Revisões
| Versão | Data | Autor | Mudanças |
|--------|------|-------|---------|
| 1.0 | 2026-11-22 | reversa-spec-sdd | Criação inicial |

---

## Relatório de avaliação (reversa-spec-sdd)

**Score total:** 100.0/100, ⭐ Excelente — Pronta para implementação
**Iterações:** 1
**Avaliado em:** 2026-11-22T20:50:19-03:00 (scorer `spec_scorer.py`, heurística estrutural)

| Dimensão | Score | Contribuição |
|---|---|---|
| Completude | 100% | 30.0 |
| Testabilidade | 100% | 25.0 |
| Clareza | 100% | 20.0 |
| Escopo | 100% | 15.0 |
| Edge Cases | 100% | 10.0 |

**Gaps críticos:** nenhum.
**Sugestões:** nenhuma do scorer. As pendências de conteúdo estão na seção 14 (Open Questions).
