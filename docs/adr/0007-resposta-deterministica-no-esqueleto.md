# ADR-0007: Resposta determinística atrás da porta AnswerGenerator

- Status: aceito
- Data: 2026-11-22
- Decisores: Leandro (produto), reversa-clarify
- Origem: `_reversa_forward/001-walking-skeleton/requirements.md#9` (sessão 2026-11-22), `roadmap.md` (D-11)

## Contexto

O walking skeleton precisa provar o caminho mensagem → busca → resposta com citação. O provedor de LLM ainda é uma questão aberta (local vs. pago, OQ-01 de `conversational-agent`).

## Decisão

- Porta `AnswerGenerator` na camada de aplicação do módulo `agent`.
- Implementação `DeterministicAnswerGenerator`: lista até 3 evidências com autor, fonte e data; sem resultados ou com `low_confidence`, responde "não encontrei evidências suficientes".
- `CitationValidator` confere que toda citação aponta para uma mensagem presente nos resultados da busca, independentemente da implementação do gerador.

## Consequências

- Positivas: testes E2E estáveis, custo zero, nenhum dado sai da máquina; a feature do agente adiciona um gerador com LLM sem mudar ingestão, busca ou adaptadores.
- Negativas: respostas pouco naturais no esqueleto.
