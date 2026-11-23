# Spec: media-transcription

**Versão:** 1.0
**Status:** Rascunho
**Autor:** reversa-spec-sdd
**Data:** 2026-11-22
**Reviewers:** N/A

> Selo 🟡 PLANEJADO em todos os itens. Fonte: `_reversa_sdd/prd.md`.

---

## 1. Resumo

🟡 Armazena áudios e documentos das mensagens em object storage e transcreve os áudios em português com marcação de tempo por segmento, para que a busca encontre palavras faladas e o agente aponte o trecho exato. Mantém o áudio original para reprocessar com modelos melhores.

---

## 2. Contexto e Motivação

**Problema:**
🟡 Boa parte do conhecimento dos grupos é falada em áudios, e o WhatsApp não pesquisa o conteúdo falado. Essa foi a pergunta que originou o projeto.

**Evidências:**
🟡 PRD seção 4 (transcrição em português, armazenamento de mídia) e critério de aceite "P1 (áudio)"; risco de transcrição insuficiente (seção 8).

**Por que agora:**
🟡 Sem transcrição, a jornada "em qual áudio alguém mencionou X" não existe.

---

## 3. Goals (Objetivos)

- [ ] 🟡 G-01: Todo áudio de fonte autorizada é armazenado e transcrito.
- [ ] 🟡 G-02: Cada transcrição tem segmentos com início e fim em segundos.
- [ ] 🟡 G-03: A transcrição pode ser refeita com outro modelo sem perder a versão anterior.
- [ ] 🟡 G-04: A transcrição roda localmente por padrão (restrição de custo baixo).

**Métricas de sucesso:**
| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| 🟡 Taxa de erro de palavras (WER) em corpus pt-BR de áudios de grupos | n/a | ≤ 20% | experimento de validação |
| 🟡 Áudios transcritos em até 10 min após a ingestão (fila sem backlog) | n/a | ≥ 95% | v0.1 |
| 🟡 Custo por minuto de áudio | n/a | R$ 0 com execução local | v0.1 |

---

## 4. Non-Goals (Fora do Escopo)

- 🟡 NG-01: OCR de imagens e extração de texto de PDFs/documentos na v0.1 (documentos só são armazenados).
- 🟡 NG-02: Identificação de falantes (diarização) dentro de um áudio.
- 🟡 NG-03: Tradução das transcrições.
- 🟡 NG-04: Transcrição de vídeos.

---

## 5. Usuários e Personas

**Usuário primário:** 🟡 P1, que procura palavras ditas em áudios antigos.
**Usuário secundário:** 🟡 P2, que recebe resumos que incluem o conteúdo dos áudios.

**Jornada atual (sem a feature):**
🟡 O usuário ouve áudio por áudio até achar o que procura, ou desiste.

**Jornada futura (com a feature):**
1. 🟡 O áudio chega por captura ou importação.
2. 🟡 O sistema o armazena e transcreve com segmentos.
3. 🟡 O usuário pergunta e recebe a mensagem de áudio e o trecho onde a palavra aparece.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | 🟡 O sistema deve gravar cada anexo no object storage com chave `space_id/source_id/message_id/attachment_id` e atualizar `Attachment.status` para `stored`. | Must | 🟡 Após o job `media.store`, o objeto existe e o status é `stored`. |
| RF-02 | 🟡 O sistema deve calcular o hash SHA-256 do binário e reutilizar o objeto quando o mesmo arquivo chegar de novo na mesma fonte. | Should | 🟡 O mesmo áudio por captura e importação gera 1 objeto. |
| RF-03 | 🟡 O sistema deve enfileirar `media.transcribe` para anexos de áudio (`audio/*`, incluindo `opus` e `ogg`). | Must | 🟡 Todo áudio armazenado tem um job de transcrição. |
| RF-04 | 🟡 O sistema deve transcrever em pt-BR por padrão, com detecção de idioma quando a confiança de pt for menor que 0,5. | Must | 🟡 Áudio em inglês é transcrito em inglês e o idioma fica gravado. |
| RF-05 | 🟡 O sistema deve gravar a `Transcript` com texto completo, idioma, modelo, versão do modelo e segmentos (`start_s`, `end_s`, `text`). | Must | 🟡 Transcrição de áudio de 3 min tem segmentos contíguos que cobrem a duração. |
| RF-06 | 🟡 O sistema deve disparar `knowledge.index` da mensagem após concluir a transcrição. | Must | 🟡 A palavra falada fica pesquisável depois da transcrição. |
| RF-07 | 🟡 O sistema deve permitir retranscrever por fonte ou por período com outro modelo, mantendo as versões e marcando uma como ativa. | Should | 🟡 Após retranscrever, a busca usa a versão ativa e a anterior continua consultável. |
| RF-08 | 🟡 O sistema deve recusar áudios acima de 60 min com status `too_long`. | Must | 🟡 Áudio de 90 min não é transcrito e o motivo fica registrado. |
| RF-09 | 🟡 O sistema deve fornecer URL temporária (expira em 15 min) para o usuário dono ouvir o áudio ou o trecho. | Should | 🟡 URL expira e não funciona para outro espaço. |

### 6.2 Fluxo Principal (Happy Path)

1. 🟡 A ingestão publica `media.store` para um áudio.
2. 🟡 O sistema grava o binário e enfileira `media.transcribe`.
3. 🟡 O worker transcreve localmente e grava a `Transcript` com segmentos.
4. 🟡 O sistema publica `knowledge.index` da mensagem.
5. 🟡 Resultado: o conteúdo falado fica pesquisável com marcação de tempo.

### 6.3 Fluxos Alternativos

**Fluxo Alternativo A — Áudio sem fala:**
1. 🟡 O modelo retorna texto vazio ou só ruído; o sistema grava `Transcript` com `empty=true` e não indexa texto.

**Fluxo Alternativo B — Retranscrição:**
1. 🟡 O operador pede retranscrição com um modelo maior; o sistema cria nova versão e reindexa a mensagem.

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | 🟡 Performance | 🟡 Fator de tempo real ≤ 0,5 (1 min de áudio em ≤ 30 s) | 🟡 Com modelo local de porte médio em CPU/GPU disponível. |
| RNF-02 | 🟡 Custo | 🟡 Execução local por padrão | 🟡 Provedor pago só por configuração explícita. |
| RNF-03 | 🟡 Segurança | 🟡 Objetos criptografados em repouso | 🟡 Bucket privado, sem acesso público. |

---

## 8. Design e Interface

**Componentes afetados:** 🟡 Workers `media.store` e `media.transcribe`, bucket de mídia, tabela de transcrições.

**Comportamento esperado:**
🟡 O motor de transcrição fica atrás de uma interface `Transcriber`, permitindo trocar o modelo local por outro sem alterar o restante.

**Estados da UI:**
- 🟡 Estado vazio: áudio sem fala, indicado como "áudio sem fala reconhecível".
- 🟡 Estado de carregamento: "áudio ainda em transcrição" quando o agente cita uma mensagem pendente.
- 🟡 Estado de erro: "não consegui transcrever este áudio" com motivo (`too_long`, `corrupted`, `failed`).
- 🟡 Estado de sucesso: transcrição disponível com trechos.

---

## 9. Modelo de Dados

```
Transcript { id: uuid, attachment_id: uuid, space_id: uuid, language: text, model: text, model_version: text,
             text: text, empty: bool, is_active: bool, created_at: timestamptz }
TranscriptSegment { transcript_id: uuid, idx: int, start_s: numeric, end_s: numeric, text: text }
Attachment (+) { sha256: text?, duration_s: numeric?, transcription_status: enum(pending, done, too_long, failed) }
```

**Migrações necessárias:** 🟡 Sim.

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| 🟡 Object storage (MinIO local, migrável para S3) | Obrigatória | 🟡 Jobs ficam em retry; mensagens de texto seguem normais. |
| 🟡 Modelo de transcrição (Whisper ou equivalente local) | Obrigatória | 🟡 Áudios ficam `pending`; busca funciona sem conteúdo falado. |
| 🟡 Decodificador de áudio (ffmpeg) | Obrigatória | 🟡 Transcrição falha com `failed` e retry. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| 🟡 EC-01: Arquivo corrompido | 🟡 Decodificação falha | 🟡 Status `failed` com motivo `corrupted`, sem retry. |
| 🟡 EC-02: Falha ou timeout do motor de transcrição | 🟡 Processo cai ou excede 3× a duração | 🟡 Retry 3 vezes com backoff; depois `failed` e métrica de falha. |
| 🟡 EC-03: Backlog de áudios na importação | 🟡 Milhares de áudios de uma vez | 🟡 Processar com concorrência configurável e prioridade para áudios capturados ao vivo. |
| 🟡 EC-04: Áudio longo demais | 🟡 Duração > 60 min | 🟡 Status `too_long`, sem transcrição. |
| 🟡 EC-05: Fonte excluída com transcrição em andamento | 🟡 Cascata de exclusão | 🟡 Cancelar o job e descartar o resultado. |

---

## 12. Segurança e Privacidade

- **Autenticação:** 🟡 Workers internos; URLs temporárias para o dono.
- **Autorização:** 🟡 Acesso a mídia sempre filtrado por `space_id`.
- **Dados sensíveis:** 🟡 Áudios e transcrições são conteúdo privado; com execução local, não saem da máquina.
- **Auditoria:** 🟡 Registrar emissão de URLs temporárias (quem, qual anexo, quando).

---

## 13. Plano de Rollout

- **Estratégia:** 🟡 Habilitado na v0.1 com modelo local; medir WER no corpus de teste antes de ampliar.
- **Como reverter (rollback):** 🟡 Desativar `media.transcribe`; áudios permanecem armazenados para transcrever depois.
- **Monitoramento pós-deploy:** 🟡 Tamanho da fila, fator de tempo real, taxa de falhas.

---

## 14. Open Questions

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | 🟡 Qual modelo e porte local cabem no hardware de desenvolvimento com WER ≤ 20%? | Alto | Leandro | Experimento |
| OQ-02 | 🟡 A meta de WER de 20% é suficiente para busca por palavra em nomes técnicos (ex.: "Temporal")? | Médio | Leandro | Experimento |

---

## 15. Decisões Tomadas (Decision Log)

| Decisão | Alternativas consideradas | Racional |
|---------|--------------------------|---------|
| 🟡 Transcrição local por padrão | 🟡 API paga | 🟡 Restrição de custo baixo e privacidade. |
| 🟡 Versões de transcrição | 🟡 Sobrescrever | 🟡 Reprocessamento sem perder rastreabilidade. |

---

## Apêndice

### Referências
- 🟡 `_reversa_sdd/prd.md` seções 4, 6, 7, 8

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
