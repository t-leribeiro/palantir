# Onboarding: Perguntar ao histórico importado (fatia S1)

> Pré-requisito: o ambiente da 001 funcionando (`npm run setup`, `db:migrate`, `seed`, `dev:api` e `dev:worker`).

## Roteiro de demonstração

1. **Exportar uma conversa no celular:** abra a conversa no WhatsApp → ⋮ (Android) ou nome do grupo (iOS) → **Exportar conversa** → **Sem mídia** (a S1 só usa texto). Envie o `.zip` para o computador.
2. **Importar:**

   ```bash
   npm run import -- "C:\Users\voce\Downloads\Conversa do WhatsApp com Comunidade DevOps.zip" --conversa "Comunidade DevOps"
   ```

   Você deve ver o relatório: período coberto, mensagens importadas, mensagens de sistema ignoradas e mídias encontradas.
3. **Perguntar** sobre algo que você lembra ter sido dito na conversa:

   ```bash
   curl -X POST http://localhost:8080/v1/channels/fake/agent -H "content-type: application/json" \
     -d '{"senderAccountId":"fake-operator","text":"quem recomendou o Temporal?"}'
   ```

   Você deve ver a resposta citando o autor, o nome da conversa e a data original.
4. **Reimportar** o mesmo arquivo: o relatório mostra 0 mensagens importadas e todas como já existentes.

## O que observar

- Grafana → dashboard "Palantír / Walking skeleton": o painel de mensagens ingeridas sobe durante a importação.
- `npm run eval` continua com as metas da 001 (a S1 não muda a busca).

## Privacidade

O arquivo exportado é lido no seu computador e não é copiado. As mensagens ficam só no seu PostgreSQL local. Para apagar uma conversa importada, por enquanto: `DELETE FROM sources WHERE title = '<nome>'` (a exclusão pelo WhatsApp chega na S5).
