# PRD: Palantír — Personal Knowledge Agent

> Selo 🟡 PLANEJADO. Documento gerado a partir de ideation + personas.

**Versão:** 1.0
**Data:** 2026-11-22T18:10:52-03:00
**Autor:** reversa-drafter
**Status:** rascunho

---

## 1. Problema

🟡 Uma parcela importante do conhecimento profissional circula em grupos de trabalho, comunidades profissionais e conversas do WhatsApp (textos, links, documentos e áudios), mas fica fragmentada e se perde. O WhatsApp funciona como linha do tempo, não como base de conhecimento: a busca nativa não pesquisa o conteúdo falado em áudios, não sintetiza discussões e não preserva o contexto de quem disse o quê, onde e quando. As alternativas de mercado exigem exportação manual conversa a conversa (WhatsArchive, WhatSync, SnipSound) ou entregam acesso sensível a serviços externos de maturidade não validada (Circles, Retena).

### Quem sente
- 🟡 **Profissional conectado (P1):** ao precisar reencontrar, dias ou semanas depois, uma recomendação, link ou algo dito em áudio em um dos muitos grupos técnicos que acompanha.
- 🟡 **Gestor ou consultor com pouco tempo (P2):** nas janelas curtas em que abre o WhatsApp e precisa saber o que importou sem rolar centenas de mensagens.
- 🟡 **Tech lead e time de operações/suporte (P3):** quando reportes e dúvidas se perdem no fluxo do grupo, ficam sem resposta ou se repetem apesar de já terem sido resolvidos.

---

## 2. Personas-alvo

🟡 Referência completa em [`personas.md`](./personas.md). Resumo:

- **P1, Profissional conectado** (alvo da v0.1): 🟡 profissional de tecnologia em muitos grupos técnicos; o conhecimento compartilhado (incluindo áudios) se perde e não é recuperável.
- **P2, Gestor ou consultor com pouco tempo** (alvo da v0.1): 🟡 acompanha comunidades em janelas curtas; discussões relevantes passam despercebidas.
- **P3, Tech lead e time de operações/suporte** (fase seguinte, fora da v0.1): 🟡 reportes e dúvidas ficam sem resposta e soluções já dadas não são reaproveitadas; exige conhecimento compartilhado pelo time.

---

## 3. Métricas de sucesso

🟡 As metas do MVP são hipóteses de aceitação, não resultados medidos (`ideation.md`).

| Métrica | Unidade | Alvo | Prazo |
|---|---|---|---|
| 🟡 Captura de mensagens observáveis dos grupos autorizados | % de mensagens | 🟡 ≥ 95% | 🟡 [INDEFINIDO, validar com usuário] (ideação sugere validação em 14 dias) |
| 🟡 Respostas corretas no conjunto de avaliação | % de acertos em ≥ 30 perguntas com resposta conhecida | 🟡 ≥ 85% | 🟡 [INDEFINIDO, validar com usuário] |
| 🟡 Afirmações factuais com referência à mensagem de origem | % de afirmações | 🟡 100% | 🟡 [INDEFINIDO, validar com usuário] |
| 🟡 Perguntas sem evidência respondidas com "não encontrei evidências suficientes" | % das perguntas sem evidência no conjunto de avaliação | 🟡 [INDEFINIDO, validar com usuário] | 🟡 [INDEFINIDO, validar com usuário] |

🟡 Métricas operacionais a observar no experimento, sem alvo definido: custo por áudio transcrito, latência de resposta do agente e estabilidade da captura (reconexões, duplicatas).

---

## 4. Escopo (in)

🟡 Escopo da v0.1, focado nas personas P1 e P2 (memória pessoal):

- 🟡 **Captura contínua experimental** via Baileys de grupos e conversas autorizados explicitamente (opt-in por conversa), com número secundário dedicado.
- 🟡 **Importação de histórico exportado** do WhatsApp (ZIP de conversa com mídias) para recuperar o histórico antigo.
- 🟡 **Contrato canônico de mensagens** (`CanonicalMessage`) e interface de canal (`KnowledgeChannel`), isolando o núcleo de conhecimento do provedor.
- 🟡 **Ingestão idempotente** (chave: provedor + conta + conversa + id externo da mensagem), com deduplicação entre captura e importação.
- 🟡 **Armazenamento de mídia** (áudios e documentos) em object storage.
- 🟡 **Transcrição de áudios em português**.
- 🟡 **Indexação e busca híbrida** (texto completo, aproximada e semântica) com filtros por grupo, autor e período.
- 🟡 **Agente conversacional no WhatsApp** que responde perguntas em linguagem natural com fontes (autor, grupo, data) e responde "não encontrei evidências suficientes" quando não há evidência.
- 🟡 **Recuperar a mensagem original ou o trecho de áudio** citado em uma resposta.
- 🟡 **Guardar:** encaminhar texto, link ou áudio ao agente e classificá-lo em um tema.
- 🟡 **Resumo sob demanda** de discussões por período ou tema, com convergências, divergências e fontes (P2).
- 🟡 **Separação entre evidência e conhecimento derivado** (`Message` vs. `KnowledgeItem` + `EvidenceReference`), permitindo reprocessamento.
- 🟡 **Segurança e privacidade desde o MVP:** opt-in por conversa, isolamento aplicado antes da busca, credenciais de sessão protegidas e fora de logs, exclusão de fonte com dados derivados, retenção configurável.
- 🟡 **Modelo de dados preparado para espaço compartilhado** (`KnowledgeSpace`), sem implementar compartilhamento na v0.1.
- 🟡 **Engenharia conforme `requirements.md`:** documentation/API first, TDD, pirâmide de testes, pre-commit hooks, IaC com Terraform, observabilidade (Grafana, Prometheus, Tempo, Loki).
- 🟡 **Qualidade estrutural como requisito não funcional** (complemento do usuário): testes de arquitetura (regras de dependência entre camadas e módulos, sem ciclos) e complexidade ciclomática ≤ 10 por função, ambos bloqueando commit e merge.

---

## 5. Não-objetivos (out)

- 🟡 **Persona P3 na v0.1:** espaço de conhecimento compartilhado do time, permissões por grupo para múltiplos usuários e consulta "o que ficou sem resposta" ficam para a fase seguinte (decisão do usuário).
- 🟡 **Memória ativa / resumos proativos** (comportamento "Acompanhar", alertas e resumos agendados).
- 🟡 Memória coletiva entre usuários e bot participante de comunidades.
- 🟡 Knowledge graph sofisticado e agentes autônomos.
- 🟡 Múltiplas plataformas em produção (Telegram, Slack, Teams) e extensão Chrome.
- 🟡 Interface web completa.
- 🟡 Monetização.
- 🟡 Recuperação do histórico completo pela captura e reconstrução de mensagens apagadas.
- 🟡 Kubernetes, microsserviços, Kafka ou banco de grafos dedicado.

---

## 6. Restrições

| Tipo | Descrição |
|---|---|
| 🟡 Técnica | 🟡 Monólito modular + workers; local-first no desenvolvimento. Stack sugerida na ideação: TypeScript/Node.js + Fastify, BullMQ, PostgreSQL (FTS, pg_trgm, pgvector), MinIO (migrável para S3), Whisper, LLM com tool calling, OpenTelemetry. Requisitos de engenharia de `requirements.md`. |
| 🟡 Técnica | 🟡 WhatsApp tratado como adaptador substituível; o núcleo não conhece o provedor. Baileys apenas em experimento controlado (número secundário, grupos de teste autorizados). |
| 🟡 Prazo | 🟡 [INDEFINIDO, validar com usuário] (a ideação propõe um plano de validação de 14 dias, não confirmado como prazo). |
| 🟡 Compliance | 🟡 Privacidade desde o MVP (opt-in, isolamento, criptografia, exclusão, retenção). Enquadramento LGPD e base legal para dados de terceiros nos grupos: [INDEFINIDO, validar com usuário]. Os termos de uso do WhatsApp restringem automação não oficial. |
| 🟡 Orçamento | 🟡 Custo baixo: priorizar execução local (transcrição e infraestrutura locais); serviços pagos (ex.: LLM) apenas onde necessário. |

---

## 7. Dependências externas

- 🟡 **Baileys** (integração não oficial com o protocolo do WhatsApp Web) para captura e entrega na v0.1.
- 🟡 **Formato de exportação de conversas do WhatsApp** (ZIP com texto e mídias) para importação.
- 🟡 **Whisper** (ou modelo equivalente) para transcrição em português, preferencialmente local.
- 🟡 **Provedor de LLM com tool calling e de embeddings:** [INDEFINIDO, validar com usuário] (local ou pago, conforme custo).
- 🟡 **WhatsApp Business Platform (Cloud API)** como alternativa futura para o canal de interação, fora da v0.1.

---

## 8. Riscos

| Risco | Impacto | Probabilidade | Mitigação proposta |
|---|---|---|---|
| 🟡 Captura via Baileys instável ou conta bloqueada | 🟡 Alto | 🟡 Média | 🟡 Número secundário dedicado, grupos de teste autorizados, adaptador substituível, importação como caminho complementar. |
| 🟡 Respostas imprecisas ou inventadas destroem a confiança | 🟡 Alto | 🟡 Média | 🟡 Citações obrigatórias, resposta "não encontrei evidências suficientes", conjunto de avaliação com ≥ 30 perguntas. |
| 🟡 WhatsApp não é a interface desejada para consultar a memória | 🟡 Alto | 🟡 Baixa | 🟡 Validar com uso real nas jornadas P1/P2; núcleo independente do canal de interação. |
| 🟡 Exposição de dados de terceiros dos grupos (privacidade/LGPD) | 🟡 Alto | 🟡 Média | 🟡 Opt-in por conversa, isolamento antes da busca, exclusão e retenção configuráveis; enquadramento LGPD pendente. |
| 🟡 Vazamento de credenciais de sessão do Baileys | 🟡 Alto | 🟡 Baixa | 🟡 Tratar como segredo criptografado, nunca em logs ou repositório. |
| 🟡 Transcrição em português insuficiente para busca por palavra | 🟡 Médio | 🟡 Média | 🟡 Medir no experimento; manter o áudio original para reprocessamento. |
| 🟡 Custo de LLM/transcrição acima do orçamento baixo | 🟡 Médio | 🟡 Média | 🟡 Priorizar execução local; medir custo por áudio e por pergunta. |
| 🟡 Duplicação entre mensagens capturadas e importadas | 🟡 Médio | 🟡 Alta | 🟡 Ingestão idempotente e regra de reconciliação entre captura e importação. |
| 🟡 Expectativa da P3 (time) não atendida na v0.1 | 🟡 Médio | 🟡 Média | 🟡 Modelo de dados com `KnowledgeSpace` preparado para compartilhamento na fase seguinte. |
| 🟡 Conflito de marca com Palantir Technologies | 🟡 Médio | 🟡 Alta | 🟡 Usar como codinome; validar marca e domínio antes de lançamento comercial. |

---

## 9. Critérios de aceite (alto nível)

- 🟡 **P1:** **Dado** um grupo autorizado e indexado (capturado ou importado), **Quando** o usuário pergunta ao agente no WhatsApp quem recomendou uma ferramenta, **Então** recebe a resposta com autor, grupo, data e acesso à mensagem original.
- 🟡 **P1 (áudio):** **Dado** um áudio transcrito em um grupo autorizado, **Quando** o usuário pergunta em qual áudio uma palavra foi mencionada, **Então** o agente identifica a mensagem de áudio correspondente e oferece o trecho.
- 🟡 **P1 (importação):** **Dado** o ZIP exportado de uma conversa, **Quando** o usuário o importa, **Então** mensagens e mídias ficam pesquisáveis sem duplicar mensagens já capturadas.
- 🟡 **P1 (guardar):** **Dado** um conteúdo encaminhado ao agente com o pedido "guarda isso em <tema>", **Quando** o agente processa, **Então** o conteúdo fica recuperável por esse tema.
- 🟡 **P2:** **Dado** comunidades autorizadas e indexadas, **Quando** o usuário pede um resumo de um tema em um período, **Então** recebe a síntese com convergências, divergências e fontes.
- 🟡 **Evidência:** **Dado** uma pergunta sem evidência na base do usuário, **Quando** o agente responde, **Então** informa "não encontrei evidências suficientes" em vez de inventar.
- 🟡 **Isolamento:** **Dado** dois usuários com bases distintas, **Quando** um deles pergunta, **Então** nenhuma evidência da base do outro é recuperada.

---

## Pendências de cobertura

- 🟡 Prazo do MVP (o plano de 14 dias da ideação é proposta, não prazo confirmado).
- 🟡 Prazos das métricas de sucesso e alvo da métrica de "não encontrei evidências".
- 🟡 Enquadramento LGPD e base legal para dados de terceiros capturados dos grupos.
- 🟡 Provedor de LLM e de embeddings (local vs. pago).
- 🟡 Organização das sessões do WhatsApp (recomendação da ideação: um número secundário para o agente e outro como fonte de teste).
- 🟡 Regra de reconciliação entre mensagens capturadas e importadas (o arquivo exportado não traz o id externo da mensagem).

---

Gerado por reversa-drafter em 2026-11-22T18:10:52-03:00
Fontes: ideation.md, personas.md (cobertura: escopo P3 na fase seguinte; restrição de custo baixo/local)
