# Investigation: Captura ao vivo de um grupo de teste autorizado (fatia S3)

> Identificador: `004-captura-ao-vivo-grupo-teste`
> Data: `2026-11-23`

## 1. O que já existe e é reaproveitado

- **Adaptador WhatsApp (S2):** sessão AES-256-GCM, reconexão com backoff, recibos, pacer, observabilidade e provedor simulado (`addenda/003-*`). Grupos são descartados em `isIgnoredJid` (`src/channels/whatsapp/provider/mapping.ts`), aplicado no `shouldIgnoreJid` do socket. Basta torná-lo condicional ao papel de captura.
- **Ingestão (S0/S1):** valida `CanonicalMessage`, confere a fonte por (`provider`, `accountId`, `conversationId`) em `sources/infrastructure/pg-source-repository.ts` e grava com `ON CONFLICT` no índice parcial da chave aplicável (`ingestion/infrastructure/pg-message-store.ts`). O job de indexação sai na mesma transação. Duplicata acrescenta proveniência à existente, que é o mesmo mecanismo da reconciliação.
- **Importação (S1):** id da conversa determinístico (`export:<slug>`, `sources/application/ensure-import-source.ts`). Uma importação futura com `--conversa "T3"` cai na mesma fonte, e é isso que torna a ligação explícita (D-06) suficiente.
- **Suíte de contrato:** já tem os testes de captura (`listConversations`, `onMessage` com `captureMethod=live`). Hoje são pulados no WhatsApp porque `supportsLiveCapture=false`.

## 2. Biblioteca (baileys 7.0.0-rc14), pontos verificados nos tipos instalados

| Ponto | Onde | Uso |
|-------|------|-----|
| `WAMessageKey.participant` e `participantAlt` | `node_modules/baileys/lib/Types/Message.d.ts` | Autor de mensagem de grupo; `participantAlt` traz o número quando o grupo endereça por LID |
| `GroupMetadata.addressingMode` | `lib/Types/GroupMetadata.d.ts` | Grupos em modo LID: autor pode vir só como `@lid` |
| `groupFetchAllParticipating()` | `lib/Socket/groups.d.ts` | Diretório de grupos ao conectar |
| Eventos `groups.upsert` e `groups.update` | `lib/Types/Events.d.ts` | Atualizar o diretório |
| `DisconnectReason.connectionReplaced = 440` | `lib/Types/index.d.ts` | Duas conexões com as mesmas credenciais se derrubam; por isso o comando não conecta (D-07) |
| `signalRepository.lidMapping.getPNForLID` | já usado na S2 | Último recurso para o número do autor |

Com `syncFullHistory: false` (S2), o histórico antigo não é puxado. Só chegam `notify` (mensagens novas e pendentes da reconexão), coerente com a RN-01.

## 3. Alternativas avaliadas

### 3.1 Onde guardar a autorização de captura
- **`sources.status` (descartada):** a fonte "T3" já é `authorized` pela importação. Revogar a captura mudando o status desligaria a importação e esconderia o histórico, contrariando a RN-06.
- **Coluna de apelido em `sources` (descartada):** resolve a ligação, mas não tem onde guardar consentimento, autor e momento, nem o histórico de revogações.
- **Tabela `source_captures` (escolhida):** separa as duas autorizações, guarda o consentimento e é a auditoria por construção.

### 3.2 Como o comando vê os grupos
- **O comando conecta ao WhatsApp (descartada):** com o processo `dev:whatsapp` no ar, as duas conexões se derrubam (440). Com ele parado, o comando precisaria parear ou carregar a sessão do agente.
- **Endpoint administrativo no health (descartada):** abre uma superfície HTTP de escrita num processo que hoje só expõe leitura.
- **Diretório no banco (escolhida):** o processo grava e o comando lê. O custo é a lista ficar desatualizada com o processo parado, e a data da última atualização mostra isso.

### 3.3 Quando reconciliar
- **Job posterior (descartada):** durante a janela, a mesma mensagem aparece duas vezes nas respostas.
- **Na gravação, só no sentido importada → ao vivo (descartada):** não cobre a captura que entrega pendências depois de uma importação feita com o processo parado.
- **Na gravação, nos dois sentidos (escolhida):** a regra é a mesma nos dois, e a candidata travada com `FOR UPDATE` evita corrida.

### 3.4 Critério de igualdade
- **Autor + texto + tempo, como na spec original (descartado):** nunca casa, porque o export identifica o autor pelo nome no celular de quem exportou e a captura, pelo número ou LID.
- **Texto normalizado + tempo, com o autor só para desempatar (escolhido):** mensagens idênticas no mesmo minuto ("ok", "bom dia") são o caso difícil. O desempate pelo nome e a ordem determinística evitam casar duas vezes a mesma.

## 4. Riscos de produto e privacidade

- O consentimento é declarado pelo operador e não verificado pelo sistema. A base legal (LGPD) continua aberta (`identity-and-sources.md#14` OQ-01), e por isso a captura fica restrita a grupos de teste.
- No modo `agent`, o número do agente passa a "ler" grupos. Isso não muda o que ele envia: continua respondendo só a mensagens diretas de números cadastrados.
- Mensagens apagadas para todos continuam guardadas. Isso está registrado como lacuna para a S5.

## 5. Medições previstas na demonstração

- **Latência:** do envio no grupo até a pergunta respondida. Meta de 10 s; esperado de 2 a 4 s, com o polling do pg-boss em cerca de 2 s.
- **Janela de 60 s:** depois da demonstração, exportar o grupo e importar com `--conversa`. Medir quantas foram reconciliadas e se sobrou alguma duplicata (meta 0).
