# Ideation, Palantír — Personal Knowledge Agent

> Selo 🟡 PLANEJADO em todos os itens, sujeito a validação.

## Brief original
Precisamos dar vida ao novo projeto descrito em `ChatGPT-Ideacao.md`: o **Palantír — Personal Knowledge Agent**.

Uma memória pessoal inteligente que transforma conversas dispersas do WhatsApp (grupos de trabalho e comunidades profissionais, incluindo áudios) em conhecimento pesquisável e rastreável, consultado conversando com um número de WhatsApp dedicado ao agente. Princípios: WhatsApp-first, not WhatsApp-only; knowledge-first, not chatbot-first; personal-first, community-ready; evidence over hallucination; capture once, remember forever (respeitando retenção e exclusão).

Material de referência: `ChatGPT-Ideacao.md` (conversa de ideação com o Product Blueprint v0.1) e `requirements.md` (requisitos de engenharia).

## Problema
🟡 Muito do conhecimento profissional circula em grupos de trabalho e comunidades profissionais do WhatsApp (textos, links, documentos e áudios), mas fica fragmentado e se perde: o WhatsApp funciona como linha do tempo, não como base de conhecimento. A busca nativa não pesquisa o conteúdo falado nos áudios nem sintetiza discussões.

🟡 Quem sente: profissionais que participam de muitos grupos ricos em conhecimento técnico. Quando: no momento em que precisam reencontrar uma recomendação, um link, uma decisão ou algo dito em um áudio antigo, sem saber em qual conversa ou áudio está.

## Valor entregue
🟡 Perguntar em linguagem natural, pelo próprio WhatsApp, o que foi discutido nas suas conversas e receber a resposta com evidências verificáveis (autor, grupo, data e mensagem original), inclusive sobre conteúdo falado em áudios.

## Alternativas existentes
🟡 **WhatsArchive, WhatSync, SnipSound**: exigem exportação manual em ZIP, conversa a conversa; sem captura contínua nem perguntas em linguagem natural.
🟡 **Circles, Retena**: serviço externo com acesso sensível aos dados; maturidade não validada e suporte a português incerto.
🟡 **Community Archives**: foco em memória coletiva de comunidades, não em memória pessoal.
🟡 **Busca nativa do WhatsApp / transcrição de voz**: não pesquisa conteúdo falado em áudios antigos nem sintetiza discussões.
🟡 **WhatsApp Memory Search (open source)**: referência técnica possível (importação, PostgreSQL, busca semântica com evidências), não um produto pronto.

## Público-alvo (bruto)
🟡 Profissionais que participam de vários grupos de trabalho e comunidades profissionais ricas em conhecimento. Primeiro usuário: o próprio idealizador (uso pessoal), antes de qualquer oferta para comunidades.

## Métricas de sucesso
🟡 Captura: ≥ 95% das mensagens observáveis dos grupos autorizados capturadas.
🟡 Qualidade de resposta: ≥ 85% de respostas corretas em um conjunto de pelo menos 30 perguntas com resposta conhecida.
🟡 Rastreabilidade: 100% das afirmações factuais acompanhadas de referência à mensagem de origem.
🟡 As metas são hipóteses de aceitação do MVP, não resultados medidos.

## Premissas a validar
🟡 1. A captura não oficial via Baileys, com número secundário dedicado, é estável o suficiente (reconexão, deduplicação, mídia) e não leva a bloqueio da conta.
🟡 2. A recuperação (busca híbrida + LLM + transcrição em português) acerta o suficiente para gerar confiança, e o agente sabe responder "não encontrei evidências suficientes" em vez de inventar.
🟡 3. Conversar com um número no WhatsApp é a interface que o usuário realmente quer para consultar a própria memória, sem precisar de interface web.

## Notas
🟡 Comportamentos centrais do agente: **Perguntar**, **Guardar** (encaminhar texto/link/áudio para a memória) e **Acompanhar** (memória ativa, fora da v0.1).
🟡 Decisões do Blueprint v0.1: memória pessoal antes de coletiva; conhecimento privado por padrão; captura com Baileys apenas em experimento controlado; WhatsApp como adaptador substituível (contrato `CanonicalMessage` e interface `KnowledgeChannel`); separação entre mensagem original (evidência) e conhecimento derivado (interpretação); monólito modular + workers; local-first no desenvolvimento.
🟡 Stack sugerida na ideação: TypeScript/Node.js + Fastify, BullMQ, PostgreSQL (FTS, pg_trgm, pgvector), MinIO/S3, Whisper, LLM com tool calling, OpenTelemetry.
🟡 Segurança e privacidade desde o MVP: opt-in por conversa, isolamento aplicado antes da busca vetorial, criptografia de credenciais de sessão, exclusão de fonte com dados derivados, retenção configurável.
🟡 Fora da v0.1: memória coletiva, knowledge graph sofisticado, agentes autônomos, múltiplas plataformas em produção, interface web completa, monetização e resumos proativos.
🟡 Decisão em aberto: organização das sessões do WhatsApp (recomendação: um número secundário para o agente e outro número de teste como fonte).
🟡 Risco de marca: o nome "Palantir" é associado à Palantir Technologies; validar antes de lançamento comercial.

---
Gerado por reversa-ideator em 2026-11-22T11:33:22-03:00
Fonte: newproject-brief.md (insumo: ChatGPT-Ideacao.md, conteúdo confirmado pelo usuário)
