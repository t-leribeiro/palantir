# ADR-0008: TypeScript sobre Node.js 22 LTS, selecionado via nvm

- Status: aceito
- Data: 2026-11-22
- Decisores: Leandro (produto), reversa-plan
- Origem: `_reversa_forward/001-walking-skeleton/roadmap.md` (D-01)

## Contexto

A stack escolhida é TypeScript/Node.js (mesma linguagem do Baileys, a captura prevista). A máquina do usuário usa Node 18 em outros projetos; o Node 18 está fora de suporte.

## Decisão

- Node.js 22 LTS, instalado e selecionado via nvm (nvm-windows na máquina do usuário), sem substituir a versão global usada por outros projetos.
- Versão fixada em `.nvmrc`, `package.json#engines` e `engine-strict=true` no `.npmrc`.
- `npm run doctor` falha se a versão ativa não for 22.
- TypeScript em modo `strict`, módulos ESM.

## Consequências

- Positivas: runtime suportado; convivência com outros projetos.
- Negativas: no nvm-windows, `nvm use` troca a versão de todos os terminais; é preciso alternar ao mudar de projeto.
