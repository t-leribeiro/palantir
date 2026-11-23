# Requirements: Perguntar ao histórico importado (fatia S1)

> Identificador: `002-perguntar-historico-importado`
> Data: `2026-11-23`
> Pasta da extração reversa: `_reversa_sdd/` (specs 🟡 do `/reversa-new` + adendo vigente `addenda/001-walking-skeleton.md`)
> Plano: `docs/plano-de-fatias.md`, fatia S1
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA / DÚVIDA

## 1. Resumo executivo

O usuário exporta uma conversa do WhatsApp no celular ("Exportar conversa", com ou sem mídia), importa o arquivo no Palantír com um comando e passa a perguntar sobre o histórico antigo pelo canal de teste, recebendo respostas com autor, conversa e data originais. É a primeira vez que o Palantír trabalha com dados reais do usuário, e sem nenhuma integração não oficial. Esta fatia traz só os textos: as mídias são contadas no relatório e ficam para a S4.

## 2. Contexto a partir do legado

| Fonte | Trecho relevante | Confidência |
|-------|------------------|-------------|
| `_reversa_sdd/sdd/whatsapp-export-importer.md#6. Requisitos Funcionais` | Formatos Android/iOS em pt-BR e en, multilinha, mensagens de sistema ignoradas, chave de importação determinística, fuso informado, relatório | 🟡 |
| `_reversa_sdd/sdd/whatsapp-export-importer.md#7. Requisitos Não-Funcionais` | Streaming, proteção contra zip bomb e path traversal | 🟡 |
| `_reversa_sdd/sdd/ingestion.md#6. Requisitos Funcionais` | RF-03: deduplicação de importadas por (`source_id`, `import_key`) | 🟡 |
| `_reversa_sdd/addenda/001-walking-skeleton.md#Impacto por artefato da extração` | Ingestão, índice textual, busca por fração de termos e agente com citações já existem; `messages.import_key` com índice único já está no banco | 🟢 |
| `_reversa_sdd/sdd/channel-contract.md#9. Modelo de Dados` | `externalMessageId` opcional em `export_import`; importação é `captureMethod`, não provedor | 🟢 |
| `docs/plano-de-fatias.md` | Escopo da S1: só textos, demonstrável pelo canal de teste | 🟢 |

## 3. Personas e cenários de uso

| Persona | Objetivo | Cenário-chave |
|---------|----------|---------------|
| P1, Profissional conectado | Recuperar o que foi dito há semanas num grupo técnico | Exporta o grupo, importa e pergunta "quem recomendou o Temporal?" |
| P2, Gestor com pouco tempo | Ter o histórico das comunidades disponível para consulta | Importa duas comunidades e pergunta sobre um assunto |
| Operador (idealizador) | Validar o produto com dados reais, sem risco de bloqueio do número | Importa um grupo próprio e confere as respostas |

## 4. Regras de negócio novas ou alteradas

1. **RN-01:** Importar uma conversa é um ato explícito de autorização (opt-in) daquela conversa para o espaço do usuário que importa. 🟡
   - Origem: `_reversa_sdd/sdd/identity-and-sources.md#6. Requisitos Funcionais` (RF-04, RF-05) e `whatsapp-export-importer.md` (RF-04)
   - Tipo: nova
2. **RN-02:** Reimportar o mesmo arquivo, ou um arquivo exportado depois que contém as mesmas mensagens, nunca duplica mensagens. 🟡
   - Origem: `_reversa_sdd/sdd/whatsapp-export-importer.md#6` (RF-05) e `ingestion.md#6` (RF-03)
   - Tipo: nova
3. **RN-03:** Duas mensagens idênticas do mesmo autor no mesmo minuto são mensagens distintas e ambas são guardadas. 🟡
   - Origem: `_reversa_sdd/sdd/ingestion.md#11` (EC-01)
   - Tipo: nova
4. **RN-04:** Mensagens de sistema (entradas, saídas, troca de nome, aviso de criptografia, mensagem apagada) não são conhecimento e não ficam pesquisáveis. 🟡
   - Origem: `_reversa_sdd/sdd/whatsapp-export-importer.md#6` (RF-07)
   - Tipo: nova
5. **RN-05:** A importação nunca grava mensagens de um formato que ela não reconhece com segurança: arquivo não reconhecido não importa nada. 🟡
   - Origem: `_reversa_sdd/sdd/whatsapp-export-importer.md#11` (EC-01)
   - Tipo: nova

## 5. Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite | Confidência |
|----|-----------|------------|--------------------|-------------|
| RF-01 | O operador deve poder importar um arquivo exportado do WhatsApp (o `.zip` ou o `.txt` de dentro dele) por um comando, informando o nome da conversa. | Must | `npm run import -- <arquivo> --conversa "<nome>"` importa e imprime o relatório; arquivo inexistente gera erro claro e não grava nada. | 🟡 |
| RF-02 | O sistema deve interpretar os formatos de linha do Android e do iOS, em pt-BR e en, incluindo mensagens com várias linhas. | Must | Amostras dos 4 formatos (no repositório, sintéticas) são interpretadas com 100% das linhas corretas; texto multilinha vira uma mensagem só. | 🟡 |
| RF-03 | O sistema deve resolver a ordem dia/mês das datas: pt-BR usa dia/mês; para en, detecta pelo arquivo (algum valor > 12) e, se ambíguo, aceita a opção `--formato-data`. | Must | Arquivo en com data 11/23/26 é lido como 23 de novembro; arquivo ambíguo sem a opção é recusado com instrução. | 🟡 |
| RF-04 | O sistema deve ignorar mensagens de sistema e contar quantas foram ignoradas. | Must | Linhas como "Mensagens e ligações são protegidas com a criptografia de ponta a ponta", "X entrou usando o link" e "Esta mensagem foi apagada" não ficam pesquisáveis e aparecem no relatório como ignoradas. | 🟡 |
| RF-05 | O sistema deve identificar referências a mídia (áudio, imagem, documento, "<Mídia oculta>") e registrá-las no relatório, sem guardar os arquivos nesta fatia. | Must | Relatório mostra a quantidade de mídias encontradas e indica que serão tratadas na S4; nenhuma mídia é gravada. | 🟡 |
| RF-06 | O sistema deve gravar cada mensagem como importada, com autor, conversa, data e hora no fuso informado (padrão America/Sao_Paulo). | Must | Mensagem "22/11/2026 10:00" importada com o padrão fica com 13:00 UTC; com `--fuso UTC`, fica com 10:00 UTC. | 🟡 |
| RF-07 | O sistema deve gerar uma chave determinística por mensagem, para que reimportar não duplique (RN-02) e mensagens iguais no mesmo minuto não se fundam (RN-03). | Must | Importar o mesmo arquivo 2 vezes resulta em 0 mensagens novas na segunda; duas linhas idênticas no mesmo minuto resultam em 2 mensagens. | 🟡 |
| RF-08 | O sistema deve criar a conversa no espaço do operador como fonte autorizada na primeira importação e reutilizá-la nas seguintes com o mesmo nome. A fonte pertence à conta de canal `whatsapp` do operador, criada nesse momento se ainda não existir (sem número; a S2 completa com o número real). | Must | Primeira importação cria a conta `whatsapp` do operador, se faltar, e 1 fonte autorizada nela; segunda importação com o mesmo `--conversa` não cria outra; nenhuma conta nova é criada para o operador. | 🟢 |
| RF-09 | O sistema deve imprimir um relatório ao final: mensagens importadas, já existentes, de sistema ignoradas, mídias encontradas, linhas não reconhecidas e período coberto. | Must | O relatório soma exatamente as linhas do arquivo. | 🟡 |
| RF-10 | O sistema deve recusar arquivos inseguros ou inválidos sem gravar nada: ZIP sem `.txt`, ZIP com caminho fora da pasta (path traversal), taxa de compressão acima de 100:1 ou tamanho acima de 2 GB. | Must | Cada caso tem teste que confirma a recusa com mensagem explicativa e 0 mensagens gravadas. | 🟡 |
| RF-11 | As mensagens importadas devem ficar pesquisáveis pelo agente, com citação da conversa e da data originais. | Must | Depois de importar, "quem recomendou o Temporal?" responde citando autor, nome da conversa e data da mensagem original. | 🟡 |
| RF-12 | O sistema deve recusar o arquivo inteiro quando mais de 5% das linhas não forem reconhecidas, indicando um exemplo do padrão encontrado sem expor o conteúdo. | Should | Arquivo de outro aplicativo é recusado com "formato não reconhecido" e 0 mensagens gravadas. | 🟡 |

## 6. Requisitos Não Funcionais

| Tipo | Requisito | Evidência ou justificativa | Confidência |
|------|-----------|----------------------------|-------------|
| Desempenho | 10.000 mensagens de texto importadas em ≤ 2 min na máquina local | `_reversa_sdd/sdd/whatsapp-export-importer.md#3` | 🟡 |
| Robustez | Leitura em streaming: o arquivo não é carregado inteiro na memória | `whatsapp-export-importer.md#7` (RNF-02) | 🟡 |
| Segurança | Proteção contra zip bomb e path traversal (RF-10); o arquivo original não é copiado nem guardado pelo Palantír | `whatsapp-export-importer.md#7` (RNF-03) e `#12` | 🟡 |
| Privacidade | Logs, relatório e erros nunca mostram o texto das mensagens; o exemplo de linha não reconhecida mostra só o padrão (ex.: `NN/NN/NNNN NN:NN - X: ...`) | `_reversa_sdd/sdd/channel-contract.md#12` | 🟢 |
| Arquitetura | O formato do WhatsApp fica só no adaptador de importação; o núcleo recebe `CanonicalMessage` com `captureMethod=export_import` | ADR-0004; RNF-05 | 🟢 |
| Qualidade | Gates da 001 valem: complexidade ≤ 10, testes de arquitetura, TDD, mutação ≥ 60% no núcleo | `requirements.md`; ADR-0005 | 🟢 |
| Tamanho | Fatia com no máximo ~15 ações | `docs/plano-de-fatias.md` (regra 1) | 🟢 |

## 7. Critérios de Aceitação

```gherkin
Cenário: Importar uma conversa e perguntar sobre ela
  Dado um arquivo exportado do WhatsApp com a mensagem "Recomendo o Temporal para workflows longos" de "Diego" em 10/11/2026
  Quando o operador importa o arquivo com --conversa "Comunidade DevOps"
  E pergunta "quem recomendou o Temporal?" pelo canal de teste
  Então a resposta cita Diego, "Comunidade DevOps" e 10/11/2026

Cenário: Reimportar não duplica
  Dado um arquivo já importado
  Quando o operador importa o mesmo arquivo de novo
  Então o relatório mostra 0 mensagens importadas e todas como já existentes

Cenário: Mensagens iguais no mesmo minuto
  Dado um arquivo com duas linhas "ok" de "Ana" às 10:00
  Quando o operador importa o arquivo
  Então existem 2 mensagens "ok" de Ana às 10:00

Cenário: Mensagem com várias linhas
  Dado uma mensagem de 3 linhas no arquivo
  Quando o operador importa o arquivo
  Então ela vira uma única mensagem com as 3 linhas

Cenário: Formatos Android e iOS em pt-BR e en
  Dado as quatro amostras de formato no repositório
  Quando cada uma é importada
  Então todas as linhas são interpretadas corretamente

Cenário: Mensagens de sistema ignoradas
  Dado um arquivo com o aviso de criptografia e "Bia entrou usando o link"
  Quando o operador importa o arquivo
  Então essas linhas não ficam pesquisáveis e aparecem como ignoradas no relatório

Cenário: Mídias contadas, não guardadas
  Dado um arquivo com "<Mídia oculta>" e "PTT-20261110-WA0001.opus (arquivo anexado)"
  Quando o operador importa o arquivo
  Então o relatório mostra 2 mídias encontradas e nenhuma mídia é gravada

Cenário: Arquivo malicioso
  Dado um ZIP com um caminho "../../fora.txt"
  Quando o operador tenta importá-lo
  Então a importação é recusada por segurança e nenhuma mensagem é gravada

Cenário: Formato não reconhecido
  Dado um arquivo de texto que não é uma exportação do WhatsApp
  Quando o operador tenta importá-lo
  Então a importação é recusada com "formato não reconhecido" e nenhuma mensagem é gravada

Cenário: Data ambígua em inglês
  Dado um arquivo en em que todas as datas têm dia e mês ≤ 12
  Quando o operador importa sem --formato-data
  Então a importação é recusada pedindo a opção --formato-data
```

## 8. Prioridade MoSCoW

| Item | MoSCoW | Justificativa |
|------|--------|---------------|
| RF-01 a RF-11 | Must | Formam a demonstração da S1 com segurança |
| RF-12 | Should | Protege contra importar lixo; pode ser simplificado se apertar |
| Mídias guardadas e transcritas | Won't (S4) | Fora da fatia |
| Importação pelo WhatsApp (enviar o ZIP ao agente) | Won't (S2/S5) | Depende do canal real |
| Importação assíncrona e retomável | Won't (por ora) | A chave determinística já torna seguro reimportar se algo falhar no meio |
| Reconciliação com captura ao vivo | Won't (S3) | Não há captura ao vivo ainda |

## 9. Esclarecimentos

### Sessão 2026-11-23

- **Q:** A quem pertence a conversa importada na S1?
  **R:** A uma conta de canal `provider=whatsapp` do operador, criada agora sem número e completada com o número real na S2. As conversas importadas ficam no mesmo lugar que a captura ao vivo da S3, o que facilita a reconciliação. (RF-08 atualizado)
- **Q:** Qual conversa será exportada para a demonstração?
  **R:** Decidida na hora da demo pelo usuário, seguindo o roteiro do `onboarding.md`. Os testes usam amostras sintéticas.

## 10. Lacunas

- Nenhuma lacuna aberta. As duas dúvidas foram resolvidas na sessão de 2026-11-23 (seção 9).

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-23 | Versão inicial gerada por `/reversa-requirements` | reversa |
| 2026-11-23 | Esclarecimentos: conta `whatsapp` do operador; conversa da demo escolhida na hora | reversa-clarify |
