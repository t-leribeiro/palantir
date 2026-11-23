# Cápsula de reprodução

- Commit base: `81c6f3d` (main depois do PR #6), branch `fix/002-legendas-de-midia`
- Ambiente: Windows 11, Node 22.23.5, Vitest 5.1
- Comando: `npx vitest run test/unit/whatsapp-export`
- Antes da correção: exit 1, 5 falhas (3 de reprodução em `parse.test.ts`; 2 de regressão em `real-exports.test.ts`, com `captionsLost` 209 no "Contas da Casa" e 345 no "T3")
- Depois da correção: exit 0, 42/42
- Classificação: determinística (1/1)

Efeito nos exports reais locais (só contagens; arquivos fora do git):

| Export | Importadas antes | Depois | Mídias |
|--------|------------------|--------|--------|
| Contas da Casa | 29 | 241 | 233 |
| T3 | 2.593 | 2.953 | 835 |
| Casa Sinop | 29 | 29 | 32 |
