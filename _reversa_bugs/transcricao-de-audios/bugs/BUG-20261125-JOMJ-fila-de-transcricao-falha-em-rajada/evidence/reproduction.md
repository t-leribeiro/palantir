# Cápsula de reprodução: BUG-20261125-JOMJ

- Commit base: `a55fad1` mais o change set do BUG-20261125-B4B3 (branch `fix/005-transcricao-longa`, ainda sem commit)
- Ambiente: Windows 11, Git Bash, Node 22.23.5, tsx; motor Speaches local; anexos reais do T3 (só tamanhos e tipos impressos)
- Comando 1: `node --env-file-if-exists=.env --import tsx evidence/prazo-quebrado.mts b189d61b… 0a05cfd1…`
  - `b189d61b` (236,060 s): prazo `708180.0000000001`; `AbortSignal.timeout` lança `RangeError ERR_OUT_OF_RANGE` ("It must be an integer")
  - `0a05cfd1` (435,680 s): prazo `1307040`; ok
- Comando 2: o adaptador real com o áudio de `b189d61b`: `falhou em 6 ms; TranscriberError: o motor de transcrição não está acessível`, sem nenhum pedido chegar ao transporte nem ao motor
- Correlação nos 160 áudios com duração: 126 `done`, todos com prazo inteiro; 34 `failed/unavailable`, todos com prazo não inteiro
- Taxa: 34/34 dos áudios com prazo não inteiro (determinístico, por áudio)
- Classificação: deterministic
- Timeline de 2026-11-25 19:37:43 (worker pid 28960): 55 ms depois da resposta do áudio de 435 s, o seguinte falha; as tentativas seguem falhando por 2 min, e o motor não recebe nada
