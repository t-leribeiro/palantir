# ADR-0011: Gestão de fontes pelo agente, com verificação de posse e exclusão em duas etapas

- Status: aceito
- Data: 2026-11-24
- Decisores: Leandro (produto), reversa-plan
- Origem: `_reversa_forward/006-gerenciar-grupos-pelo-agente/roadmap.md` (D-01 a D-20) e esclarecimento de 2026-11-24

## Contexto

Até a S4, só o operador autorizava e revogava grupos, pelo terminal (S3). O número pessoal era vinculado por um ato do operador, sem prova de posse (S2). E nada apagava uma fonte: o histórico de um grupo revogado ficava pesquisável para sempre. O PRD exige, desde o MVP, opt-in por conversa, exclusão de fonte com os dados derivados e auditoria. A spec `identity-and-sources` deixou em aberto a base legal (OQ-01).

A fatia S5 leva a gestão para a conversa com o agente pelo WhatsApp: listar, acompanhar, parar e apagar. Comandos destrutivos pelo celular exigem saber que quem manda é o dono do número.

## Decisão

1. **Base legal: consentimento declarado por grupo** (LGPD, art. 7º, I). Só é acompanhado o grupo em que o dono confirma que os participantes foram informados e concordam. A declaração fica em `source_captures`. Outra base legal exige nova decisão registrada. Esta decisão fecha a OQ-01.
2. **Verificação de posse:**
   - o `npm run whatsapp:link` deixa a conta `pending` e mostra no terminal um código de 6 dígitos;
   - o dono manda o código do próprio WhatsApp ao agente em até 10 min, com 5 tentativas;
   - no banco fica só o SHA-256 com sal;
   - o agente nunca manda mensagem para iniciar a verificação;
   - a migração `0008` devolveu a `pending` as contas ativas sem verificação (exceto o canal de teste).
3. **Comandos por palavras fixas, no núcleo do agente** (`grupos`, `mais`, `acompanhar`, `confirmo`, `parar`, `apagar`, `confirmo apagar <nome>`), neutros quanto ao canal. Não há LLM: para ações destrutivas, previsibilidade vale mais que flexibilidade.
4. **Estado curto da conversa no Postgres** (`agent_conversation_state`):
   - a última lista vale 30 min e dá sentido aos números;
   - a ação pendente vale 5 min e é consumida de forma atômica.
5. **Proteções contra errar de grupo:**
   - apagar exige o nome na confirmação;
   - um nome que serve para mais de uma conversa faz o agente listar as opções sem agir;
   - um número de lista vencida pede a lista de novo;
   - mensagem escrita dentro de um grupo nunca é comando.
6. **Exclusão em duas etapas:**
   - a confirmação, numa transação, marca a fonte `deleting` (ela some da busca na hora), revoga a captura, registra o pedido e a auditoria e publica `sources.delete` pelo outbox;
   - o worker purga os arquivos de mídia pelo prefixo `<space>/<source>/` e apaga a fonte, e as FKs levam o resto em cascata;
   - cada passo é idempotente, com 12 tentativas e recuo exponencial (cerca de 34 h) antes da fila morta.
7. **Aviso de conclusão** numa fila por canal (`agent.notify.whatsapp`, `agent.notify.fake`), consumida pelo processo que tem o canal e mandada pelo `sendReply` do contrato. É a única mensagem do agente sem pergunta, e o próprio dono a pediu. O canal reivindica o aviso antes de mandar; se o envio falhar, a reivindicação volta para nova tentativa. Depois do envio, o nome da conversa é apagado da tabela.
8. **Auditoria sem conteúdo** (`audit_events`): vínculo, verificação, bloqueio do código, acompanhar, parar, pedido e conclusão da exclusão. O alvo é um id, sem FK. Os detalhes só aceitam contagens. O comando `npm run auditoria` mostra o nome da fonte só enquanto ela existe, e o telefone mascarado.
9. **Filtro por grupo na pergunta:** o nome completo de uma conversa do espaço, na pergunta, restringe a busca a ela (`sourceIds`) e sai dos termos.

## Consequências

- Positivas:
  - o dono gerencia tudo pelo celular, com as mesmas regras do terminal;
  - a exclusão atende ao direito de eliminação (LGPD, art. 18, VI) e não deixa sobra no banco nem no armazenamento (`media:conferir` passou a contar objetos órfãos);
  - nenhuma mudança no contrato do canal.
- Negativas e riscos:
  - depois da migração, o dono fica sem resposta até mandar o código;
  - a lista de grupos do número de captura aparece para qualquer conta verificada da instalação. A v0.1 tem um usuário só, e o conteúdo continua isolado por espaço;
  - o nome da conversa fica em `agent_conversation_state` e em `source_deletions.notify_title` até expirar ou até o aviso ser mandado;
  - o filtro por grupo exige o nome completo: "T3" não reconhece "T3 - Titanium Tech".

## Alternativas consideradas

- **Base legal por uso estritamente pessoal (art. 4º, I) ou por legítimo interesse (art. 7º, IX):** liberariam grupos sem consentimento, mas com riscos e obrigações que não cabem na v0.1. Ficam registradas, não adotadas.
- **Código mandado pelo agente ao número:** é o padrão de SMS, mas exige mensagem espontânea, que aumenta o risco de bloqueio (ADR-0009).
- **LLM para reconhecer a intenção:** é a proposta da S9; para ações destrutivas, o reconhecimento por palavras fixas é mais seguro.
- **Exclusão síncrona na resposta:** estoura o tempo de resposta e não tem retentativa se o armazenamento falhar.
- **`DeleteObjects` em lote no S3:** exige um checksum que o SeaweedFS não confere. A purga apaga um objeto por vez, o que é suficiente no volume da v0.1.
- **Uma fila de aviso só:** com a API e o WhatsApp no ar, o aviso poderia cair no processo sem o canal certo.

## Quando revisar

- Antes de acompanhar grupos sem o consentimento declarado (nova base legal).
- Quando houver mais de um usuário por instalação: o diretório de grupos do número de captura precisa de dono.
- Se a exclusão de uma fonte grande passar de 5 min: apagar em lotes.
- Quando a S9 trouxer intenções por LLM: os comandos destrutivos continuam exigindo confirmação explícita.
