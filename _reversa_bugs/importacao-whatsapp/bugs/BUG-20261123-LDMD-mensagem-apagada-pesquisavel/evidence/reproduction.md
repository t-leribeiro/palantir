# Cápsula de reprodução

- Commit base: `0cfee41` (main com a S1), branch `fix/002-export-real`
- Ambiente: Windows 11, Node 22.23.5 (nvm), Vitest 4
- Comando: `npx vitest run --project unit test/unit/whatsapp-export`
- Antes da correção: exit 1, 7 testes falhando (os 6 de reprodução e o local sobre `exports/`)
- Depois da correção: exit 0, 111/111 na suíte unitária; DoR local completa verde (`npm run dor`)
- Taxa: 1/1, determinístico
- Export real: execução a seco com portas em memória, só contagens (nenhum conteúdo impresso). Export real: 7 mensagens 'Mensagem apagada' entravam como texto; agora 0.
