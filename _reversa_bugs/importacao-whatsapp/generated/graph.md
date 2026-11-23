<!-- GENERATED, DO NOT EDIT: regenerado por /reversa-debugger-graph em 2026-11-23T11:08:41-03:00 a partir de 5 bugs -->

# Grafo · importacao-whatsapp

```mermaid
graph LR
  BUG_20261123_5UZC["#5 Prefixo "~" de contato fora da agenda en"]
  BUG_20261123_6E3T["#2 Mensagem sem texto é contada como rejeit"]
  BUG_20261123_B43L["#1 Trecho de outra conversa colado numa men"]
  BUG_20261123_LDMD["#3 "Mensagem apagada" entra como texto pesq"]
  BUG_20261123_SIUF["#4 Sufixo "<Mensagem editada>" fica dentro "]
```

## Clusters

Os 5 bugs convergem em `src/channels/whatsapp-export/parse.ts` (parser do export do WhatsApp): o adaptador foi validado só com fixtures sintéticas e o primeiro export real expôs formas que elas não tinham. Corrigidos juntos.

## Impact score

Heurística de triagem (causados*3 + bloqueados*2 + regressões*4 + relacionados*1, só arestas supported/confirmed); não substitui priority/severity.

Nenhum bug aberto.
