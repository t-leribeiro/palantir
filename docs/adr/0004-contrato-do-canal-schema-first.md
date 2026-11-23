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

## Atualização 2026-11-23: contrato 1.1.0

A fatia S1 (feature `002`) acrescentou `source.importKey` (SHA-256 em hexadecimal), obrigatório quando `captureMethod = export_import`. É uma mudança aditiva: o núcleo aceita qualquer `1.x`, e adaptadores 1.0.0 continuam válidos. A chave deduplica reimportações sem reaproveitar `externalMessageId`, que fica reservado para a captura ao vivo e para a reconciliação da S3.

## Atualização 2026-11-23: contrato 1.2.0

A fatia S2 (feature `003`) acrescentou `outcome: "help"` ao `AgentReply`: ajuda curta para cumprimentos e pedidos de ajuda, sem busca e sem citações. É aditiva. A porta `AgentHandler` (TypeScript, fora do schema) passou a devolver `AgentReply | null`, em que `null` significa que o canal não envia nada; a rota de teste responde `204` nesse caso.

## Atualização 2026-11-23: resultado `reconciled` da ingestão

A fatia S3 (feature `004`) acrescentou `reconciled` ao `IngestOutcome` (tipo TypeScript da porta, fora dos schemas): a mensagem chegou pelo outro caminho (ao vivo × importada), casou com uma já gravada e ganhou a chave e a proveniência que faltavam, sem novo registro. A rota de teste responde `200` com `outcome: "reconciled"`. `CanonicalMessage` e `AgentReply` não mudaram: o contrato continua 1.2.0. O canal WhatsApp com papel de captura passa a declarar `supportsLiveCapture: true` e roda os testes de captura da suíte de contrato.

## Consequências

- Positivas: novo canal sem mudar o núcleo nem o banco; outros adaptadores (até em outra linguagem) podem usar os mesmos schemas.
- Negativas: passo de geração no fluxo de desenvolvimento.

## Alternativas consideradas

- Tipos escritos à mão: risco de drift.
- Zod como fonte: acopla o contrato ao TypeScript.
