# ADR-0014: Guardar conteúdo encaminhado ao agente

- Status: aceito
- Data: 2026-11-26
- Decisores: Leandro (produto)
- Origem: `_reversa_forward/009-guardar-por-tema/roadmap.md` (D-05, D-20); ADR-0011; ADR-0013

## Contexto

A S8 deixa o dono encaminhar ao agente um texto, um link, um áudio ou a legenda de uma foto e pedir "guarda em <tema>". O conteúdo passa a fazer parte da memória: aparece na listagem do tema e nas respostas às perguntas normais.

O conteúdo encaminhado quase sempre é de terceiros. Ele vem de grupos e contatos que o dono não acompanha pelo Palantír. Para esses grupos, não existe a declaração de consentimento do ADR-0011. Além disso, o WhatsApp não informa quem escreveu a mensagem original encaminhada nem quando.

Até agora, só entravam no Palantír:
- conversas que o dono exportou e importou;
- grupos acompanhados com o consentimento declarado (ADR-0011).

Mensagens diretas ao agente eram perguntas e nunca viravam base pesquisável (S2).

## Decisão

1. **Guardar é ato explícito do dono, item a item.** Nada encaminhado entra na base sem um "guarda em <tema>" do dono, numa conta verificada (ADR-0011).
   - O conteúdo é para uso pessoal do dono, no espaço pessoal dele, e fica só na máquina dele, cifrado quando é áudio (ADR-0010).
   - É o mesmo uso que o dono já faz ao manter a mensagem no próprio celular.
2. **O que não foi pedido não deixa rastro.** O encaminhado espera o pedido só na memória do processo do canal, por até 10 minutos.
   - Ele nunca vai para o banco, para o armazenamento de mídia nem para log.
   - Vencido o prazo, ele é descartado, e só a contagem fica na métrica.
3. **Autoria honesta.** O item guardado tem como autor o dono ("Você") e como data o momento em que ele encaminhou. O autor e a data originais não são inferidos.
4. **Saída sempre possível.**
   - "esquece a N" apaga um item, com a mensagem, o trecho indexado, o vetor e o arquivo do áudio quando ninguém mais o usa.
   - "apagar Guardados" apaga tudo pela exclusão em duas etapas do ADR-0011.
   - A auditoria registra guardar e esquecer sem conteúdo nem tema.
5. **Verificador externo.** Com o verificador ligado, um guardado candidato a uma resposta é enviado como qualquer outra candidata. Valem os limites do ADR-0013: só a pergunta, o texto e o autor por apelido, e só nos testes do dono.

## Consequências

- O conteúdo de terceiros fora de grupos acompanhados entra na base por decisão do dono, sem consentimento dos autores. A base é o uso pessoal, sem finalidade econômica, e o dono responde pelo que guarda.
- Reiniciar o processo do canal perde o que esperava pedido. Basta encaminhar de novo.
- O tema é tratado como conteúdo: pode ter nomes de pessoas ou de clientes e nunca vai para log, métrica ou trace.

## Quando revisar

- Antes de qualquer uso por mais de uma pessoa, porque o espaço compartilhado está fora da v0.1.
- Antes de ligar um serviço externo que receba o conteúdo guardado de forma contínua: embeddings online (ADR-0012) ou o verificador em uso contínuo (ADR-0013).
