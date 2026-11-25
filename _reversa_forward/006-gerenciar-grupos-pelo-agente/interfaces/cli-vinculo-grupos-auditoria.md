# Interface: comandos de terminal (vínculo, grupos e auditoria)

> Feature: `006-gerenciar-grupos-pelo-agente` · Decisões D-11, D-12, D-13, D-17

## 1. `npm run whatsapp:link -- "<número>"` (alterado)

**Antes (S2):** ativava o número na hora.
**Agora:** a conta fica `pending` e o terminal mostra um código de uso único.

```
$ npm run whatsapp:link -- "+55 11 98888-7777"
Número +55 11 9****-**77: vinculado e aguardando verificação.
Mande este código ao agente pelo WhatsApp, deste número, em até 10 minutos:

    482 913

Depois de 5 tentativas erradas, ou passado o prazo, rode este comando de novo para um código novo.
```

| Situação | Saída | Código de saída |
|----------|-------|-----------------|
| Número novo ou provisório (`unlinked:`) | como acima | 0 |
| Mesmo número, conta já verificada | `Este número já está verificado.` (sem código) | 0 |
| Mesmo número, conta `pending` (inclui a volta da migração 0008) | código novo, e o anterior é invalidado | 0 |
| Número de outro usuário | `Este número já está cadastrado.` (RN-07 da S2) | 1 |
| Número inválido | mensagem da S2 | 1 |

O código só aparece no terminal: ele nunca é registrado em log, métrica ou banco (no banco fica só o hash). Auditoria: `account.link_requested`.

## 2. `npm run whatsapp:grupos` (acréscimo)

O comando continua igual ao da S3 (`listar`, `autorizar`, `revogar`) e passa a usar o serviço de gestão. Acréscimo (RF-13, Could):

```
$ npm run whatsapp:grupos -- apagar 4 --nome "Projeto X"
Apagando "Projeto X". Acompanhe com: npm run auditoria
```

| Situação | Saída | Código |
|----------|-------|--------|
| `--nome` diferente do nome do grupo | `A confirmação precisa ser o nome exato: "Projeto X".` | 1 |
| Sem `--nome` | `Para apagar, confirme com --nome "<nome do grupo>".` | 1 |
| Já em exclusão | `"Projeto X" já está sendo apagado.` | 0 |

O aviso de conclusão vai para a conta verificada do dono, se houver uma. Auditoria com `channel = cli`.

## 3. `npm run auditoria` (novo)

```
$ npm run auditoria -- [--desde 2026-11-01] [--limite 50]
Quando              Ação                       Alvo                    Por      Detalhes
24/11/2026 21:10    source.deleted             fonte (apagada)         sistema  9842 mensagens, 158 áudios, 158 objetos
24/11/2026 21:08    source.deletion_requested  fonte (apagada)         whatsapp
24/11/2026 20:55    capture.authorized         Projeto X               whatsapp
24/11/2026 20:40    account.verified           conta +55 11 9••••-7777 whatsapp
```

- O nome da fonte aparece só enquanto ela existe. Depois da exclusão, aparece `fonte (apagada)`.
- O telefone aparece mascarado.
- A saída nunca mostra texto de mensagem.
- Lê só o banco: não precisa do WhatsApp conectado.

> Execução (2026-11-24): `--confirmar` já era um sinal sem valor do `autorizar` (S3), então a confirmação do `apagar` virou `--nome`. O número aparece no formato de máscara do projeto (`+55 11 9****-**77`).
