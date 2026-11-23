# Adendo: Perguntar ao histórico importado (fatia S1)

> Feature: `002-perguntar-historico-importado`
> Data: `2026-11-23`
> Cenário: `greenfield`

## Vigência

Vigente desde 2026-11-23.

## Resumo da entrega

O usuário exporta uma conversa do WhatsApp, importa com `npm run import -- <arquivo> --conversa "<nome>"` e pergunta sobre o histórico pelo canal de teste, recebendo autor, conversa e data originais. Só textos nesta fatia; mídias são contadas e ficam para a S4. 14 de 14 ações concluídas. Medido: 10.000 mensagens importadas em 53,5 s.

## Impacto por artefato da extração

As specs continuam 🟡 PLANEJADO. Lê-las junto com este adendo e com `addenda/001-walking-skeleton.md`.

| Artefato | Seção | Tipo de impacto | Delta |
|----------|-------|-----------------|-------|
| `_reversa_sdd/sdd/whatsapp-export-importer.md` | 6. Requisitos Funcionais | componente-novo | Implementados RF-01, RF-02, RF-04 a RF-09 e o RNF de segurança, para texto. RF-03 (vincular mídias) e RF-10 (assíncrono e retomável) pendentes: a importação é síncrona e a reimportação é segura pela chave. Entrada por comando, não por upload. |
| `_reversa_sdd/sdd/whatsapp-export-importer.md` | 9. Modelo de Dados | componente-novo | Não há tabela `ImportJob`: o relatório sai no fim do comando. |
| `_reversa_sdd/sdd/channel-contract.md` | 9. Modelo de Dados | delta-de-contrato-externo | Contrato 1.1.0: `source.importKey` (SHA-256 hex) obrigatório quando `captureMethod = export_import`. |
| `_reversa_sdd/sdd/ingestion.md` | 6. Requisitos Funcionais | regra-alterada | RF-03 implementado (deduplicação por `import_key`). RF-04 (reconciliação ao vivo × importado) continua pendente para a S3. |
| `_reversa_sdd/sdd/identity-and-sources.md` | 6. Requisitos Funcionais | regra-nova | Importar uma conversa a autoriza (opt-in explícito). A fonte fica na conta `provider=whatsapp` do dono, criada `pending` com `external_account_id = unlinked:<user_id>`; a S2 troca pelo número e verifica. |
| `_reversa_sdd/prd.md` | 4. Escopo (in) | componente-novo | "Importação de histórico exportado" entregue para texto. |

Impactos registrados: 6 linhas (3 `componente-novo`, 1 `delta-de-contrato-externo`, 1 `regra-alterada`, 1 `regra-nova`).

## Regras sob vigilância

W001 a W009, em `_reversa_forward/002-perguntar-historico-importado/regression-watch.md` (seção Observações).

## Fontes

- `_reversa_forward/002-perguntar-historico-importado/legacy-impact.md`
- `_reversa_forward/002-perguntar-historico-importado/regression-watch.md`
- `_reversa_forward/002-perguntar-historico-importado/requirements.md`
- `_reversa_forward/002-perguntar-historico-importado/progress.jsonl`
- `docs/adr/0004-contrato-do-canal-schema-first.md`
