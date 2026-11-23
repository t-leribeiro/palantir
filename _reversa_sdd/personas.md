# Personas e Jornadas

> Selo 🟡 PLANEJADO em todos os itens.

## Persona 1: Profissional conectado
- **Perfil:** 🟡 Profissional de tecnologia que participa de muitos grupos de trabalho e comunidades técnicas (primeiro usuário: o próprio idealizador).
- **Contexto:** 🟡 Recebe mensagens de vários grupos técnicos ao longo do dia, entre reuniões e entregas; lê só uma parte e, dias ou semanas depois, precisa reencontrar uma recomendação, um link ou algo dito em um áudio.
- **Nível técnico:** 🟡 Avançado, em engenharia de software, arquitetura e IA.
- **Dor principal:** 🟡 O conhecimento compartilhado nos grupos (incluindo áudios) se perde na linha do tempo do WhatsApp e não é recuperável pela busca nativa.
- **Objetivo final:** 🟡 Transformar o conhecimento que circula nos grupos em uma memória profissional confiável, para decidir melhor sem depender da própria memória.

### Jornada principal
1. 🟡 Autorizar os grupos e conversas a indexar (opt-in)
2. 🟡 Exportar o histórico de uma conversa no WhatsApp e importar no Palantír
3. 🟡 Receber mensagens, links e áudios nos grupos normalmente
4. 🟡 Perguntar ao agente no WhatsApp sobre um assunto ou recomendação
5. 🟡 Receber a resposta com as fontes (autor, grupo, data)
6. 🟡 Pedir a mensagem original ou o trecho do áudio
7. 🟡 Encaminhar um conteúdo ao agente e pedir para guardar com um tema

---

## Persona 2: Gestor ou consultor com pouco tempo
- **Perfil:** 🟡 Gestor ou consultor que participa de várias comunidades profissionais, mas acompanha o WhatsApp só em janelas curtas.
- **Contexto:** 🟡 Abre o WhatsApp em intervalos curtos (deslocamento, entre reuniões) e precisa saber o que importou sem rolar centenas de mensagens.
- **Nível técnico:** 🟡 Intermediário, como usuário de ferramentas de tecnologia (não desenvolvedor).
- **Dor principal:** 🟡 Discussões relevantes passam despercebidas no volume das comunidades e ler tudo não cabe na rotina.
- **Objetivo final:** 🟡 Manter-se atualizado e aproveitar o conhecimento das comunidades sem gastar horas lendo grupos.

### Jornada principal
1. 🟡 Vincular o número e selecionar as comunidades a acompanhar
2. 🟡 Importar o histórico exportado das comunidades selecionadas
3. 🟡 Abrir a conversa com o agente em um intervalo curto
4. 🟡 Pedir um resumo do que foi discutido em um período ou tema
5. 🟡 Receber a síntese com convergências, divergências e fontes
6. 🟡 Aprofundar uma discussão específica do resumo
7. 🟡 Guardar um insight relevante na própria memória

---

## Persona 3: Tech lead e time de operações e suporte
- **Perfil:** 🟡 Tech lead cuja equipe atende, via grupos de WhatsApp, os times de operações e suporte que reportam problemas e tiram dúvidas; ambos (tech lead e operações/suporte) conversam com o agente.
- **Contexto:** 🟡 Reportes e dúvidas se misturam no fluxo do grupo; muitas mensagens ficam sem resposta e problemas recorrentes já resolvidos são perguntados de novo.
- **Nível técnico:** 🟡 Tech lead avançado em tecnologia; operações e suporte de iniciante a intermediário.
- **Dor principal:** 🟡 Reportes e dúvidas se perdem ou ficam sem resposta, e as soluções já dadas não são reaproveitadas.
- **Objetivo final:** 🟡 Nenhum reporte ou dúvida sem resposta, e soluções já dadas transformadas em conhecimento reutilizável do time.

### Jornada principal
1. 🟡 Autorizar o grupo de suporte como fonte compartilhada do time
2. 🟡 Importar o histórico exportado do grupo de suporte (tech lead)
3. 🟡 Registrar problemas e dúvidas no grupo (operações e suporte)
4. 🟡 Perguntar ao agente se já existe uma solução conhecida (operações e suporte)
5. 🟡 Receber a resposta já dada antes, com a fonte, ou a indicação "sem resposta registrada"
6. 🟡 Perguntar ao agente o que ficou sem resposta no período (tech lead)
7. 🟡 Responder às pendências no grupo e ver a solução incorporada ao conhecimento do time

### Tensões de escopo a decidir no PRD
- 🟡 A P3 exige conhecimento **compartilhado por um time** (permissões por grupo e consentimento dos participantes), em tensão com "personal-first" e com "memória coletiva fora da v0.1" (`ideation.md`).
- 🟡 A detecção de mensagens sem resposta se aproxima do comportamento **Acompanhar / memória ativa**, também fora da v0.1 na ideação.
- 🟡 A importação de histórico exportado aparece nas três jornadas como caminho de recuperação do histórico antigo (a captura via Baileys não recupera histórico completo).

---
Gerado por reversa-researcher em 2026-11-22T18:07:18-03:00
Fonte: ideation.md (personas, respostas e jornadas confirmadas pelo usuário)
