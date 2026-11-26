# Registros de decisão de arquitetura (ADRs)

Formato: MADR simplificado. Um arquivo por decisão, numerado em sequência. Decisões substituídas não são apagadas: recebem status `substituído por ADR-NNNN`.

| ADR | Decisão | Status |
|-----|---------|--------|
| [0001](0001-monolito-modular-e-camadas.md) | Monólito modular com camadas Clean Architecture | aceito |
| [0002](0002-postgresql-como-banco-unico.md) | PostgreSQL como banco único (NoSQL avaliado e descartado) | aceito |
| [0003](0003-fila-no-postgresql-com-pg-boss.md) | Fila de jobs no PostgreSQL com pg-boss, com critérios de migração para Redis | aceito |
| [0004](0004-contrato-do-canal-schema-first.md) | Contrato do canal schema-first | aceito |
| [0005](0005-testes-de-arquitetura-e-complexidade.md) | Testes de arquitetura e complexidade ciclomática ≤ 10 | aceito |
| [0006](0006-iac-local-com-terraform-e-docker.md) | Ambiente local com Terraform e provider Docker | aceito |
| [0007](0007-resposta-deterministica-no-esqueleto.md) | Resposta determinística atrás de `AnswerGenerator` | aceito |
| [0008](0008-node-22-via-nvm.md) | TypeScript sobre Node.js 22 via nvm | aceito |
| [0009](0009-adaptador-whatsapp-nao-oficial.md) | Adaptador WhatsApp não oficial, isolado, para o número do agente (rc, GPL-3.0 transitiva, sessão em arquivo) | aceito |
| [0010](0010-transcricao-local-substituivel.md) | Transcrição local e substituível (porta `Transcriber`, Speaches em CPU, SaaS só por escolha explícita), mídia cifrada endereçada pelo conteúdo | aceito |
| [0011](0011-gestao-de-fontes-pelo-agente.md) | Gestão de fontes pelo agente: base legal por consentimento, verificação de posse por código, exclusão em duas etapas, auditoria sem conteúdo | aceito |
| [0012](0012-busca-por-sentido-local-substituivel.md) | Busca pelo sentido local e substituível (porta `Embedder`, Text Embeddings Inference em CPU, online só por escolha explícita), combinada com a busca por palavra, e verificador externo opcional | aceito |
| [0013](0013-envio-de-dados-de-terceiros-ao-verificador.md) | Envio de dados de terceiros ao verificador externo (Jev): pergunta, texto do trecho e autor por apelido, ligado só para testes do dono, uso contínuo condicionado a retenção zero e consentimento | aceito |
| [0014](0014-guardar-conteudo-encaminhado.md) | Guardar conteúdo encaminhado ao agente: ato explícito do dono, uso pessoal e local, sem rastro do que não foi pedido, autor sempre o dono, exclusão por item ou por fonte | aceito |
