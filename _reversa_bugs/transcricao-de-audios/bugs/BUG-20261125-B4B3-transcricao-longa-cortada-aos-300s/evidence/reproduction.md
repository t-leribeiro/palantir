# Cápsula de reprodução: BUG-20261125-B4B3

- Commit base: `a55fad1` (main), branch `main`
- Ambiente: Windows 11, Git Bash, Node 22.23.5 (undici 6.29.1), tsx
- Comando: `node --import tsx evidence/repro.mts 320`
  - servidor HTTP local que responde 200 com um `verbose_json` válido depois de 320 s;
  - adaptador `createOpenAiCompatibleTranscriber` real, sem `fetch` injetado, `durationHint: 400` (prazo do adaptador: 1.200 s)
- Saída: `falhou em 302 s; kind=unavailable name=TranscriberError`
- Exit code: 0 (o script captura o erro)
- Taxa: 1/1 no adaptador; 4/4 no ambiente real (os 4 áudios de 236 s a 461 s)
- Classificação: deterministic

Esperado: sucesso aos ~320 s, dentro do prazo de 1.200 s.
