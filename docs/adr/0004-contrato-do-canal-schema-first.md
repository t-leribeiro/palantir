# ADR-0004: Contrato do canal schema-first

- Status: aceito
- Data: 2026-11-22
- Decisores: Leandro (produto), reversa-plan
- Origem: `_reversa_forward/001-walking-skeleton/roadmap.md` (D-05), `_reversa_sdd/sdd/channel-contract.md`

## Contexto

"WhatsApp-first, not WhatsApp-only": o núcleo não pode depender de tipos do Baileys ou do WhatsApp. Requisitos de API First e Documentation First (`requirements.md`).

## Decisão

- `contracts/channel/*.schema.json` (JSON Schema 2020-12) é a fonte da verdade de `CanonicalMessage` e `AgentReply`.
- Os tipos TypeScript em `src/contracts/channel/generated.ts` são gerados por `npm run contracts:generate` e nunca editados à mão; `npm run contracts:check` falha se houver drift.
- `source.provider` é texto livre; importação é `provenance.captureMethod` (`live`, `export_import`, `forwarded_to_agent`), não um provedor.
- `AgentReply` é neutro; cada adaptador renderiza para o seu canal.
- Validação em tempo de execução com Ajv antes da ingestão.
- A API HTTP é descrita em `contracts/openapi.yaml` (OpenAPI 3.1) e verificada por teste de conformidade.

## Consequências

- Positivas: novo canal sem mudar o núcleo nem o banco; outros adaptadores (até em outra linguagem) podem usar os mesmos schemas.
- Negativas: passo de geração no fluxo de desenvolvimento.

## Alternativas consideradas

- Tipos escritos à mão: risco de drift.
- Zod como fonte: acopla o contrato ao TypeScript.
