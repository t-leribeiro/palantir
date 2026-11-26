# ADR-0015: Mutação seletiva e incremental na esteira

- Status: aceito
- Data: 2026-11-26
- Decisores: Leandro (produto)
- Origem: PR #20 (S8) e PR #21; RF-19 da `platform-foundation`; ADR-0005

## Contexto

A mutação (Stryker, nota mínima de 60%) é um dos 7 jobs obrigatórios de todo PR para a `main`. Ela mede se os testes unitários pegam mudanças no domínio e na aplicação dos módulos. É o teste mais importante da pirâmide para a qualidade dos testes, e também o mais caro:
- com a S8, chegou a 3.723 mutantes e quase 30 min no runner;
- passou do limite de 20 min do job e travou o merge do PR #20, com 97% testado e nota de 79%;
- rodava inteira em todo PR, inclusive no PR #21, que só mudava um arquivo de documentação, e de novo a cada merge na `main`.

O Stryker já estava em modo incremental, mas o arquivo com os resultados se perdia a cada execução da esteira. O repositório é público, então os runners padrão não consomem minutos do plano. O custo hoje é a espera, e passaria a ser dinheiro se o repositório ficasse privado.

## Decisão

1. **Seletiva.** No PR, a mutação só roda quando muda algo que ela alcança:
   - código em `src/`;
   - testes unitários ou o apoio deles (`test/unit/`, `test/support/`);
   - configuração da mutação ou do Vitest dela;
   - dependências (`package.json`, `package-lock.json`), a versão do Node (`.nvmrc`) ou o próprio `pr.yml`.

   Fora isso, o job termina verde em segundos e registra no resumo que a mutação foi dispensada. O job continua existindo e obrigatório, com o mesmo nome.
2. **Incremental.** O arquivo `reports/stryker-incremental.json` vai para o cache do GitHub a cada execução e volta na seguinte, a mais recente que o PR ou a `main` alcançam. O Stryker reaproveita o resultado dos mutantes cujo código e testes não mudaram e testa só o resto. A nota mínima vale sobre todos os mutantes, inclusive os reaproveitados.
3. **Completa toda semana e sob demanda.** O workflow `mutation-full.yml` roda toda a base com `--force` às segundas, às 6h, e quando disparado à mão. Ele renova o resultado incremental, para o reaproveitamento não acumular desvio. Não bloqueia merge: uma queda de nota aparece como falha do workflow, e a correção vai num PR.
4. O limite do job fica em 35 min, para o primeiro PR sem cache. O da execução completa fica em 45 min.

## Consequências

- PRs só de documentação, ADR, Reversa ou infraestrutura deixam de esperar a mutação.
- PRs de código esperam só pelos mutantes do que mudou, depois que existir um resultado incremental na `main`. O primeiro merge deste ADR roda inteiro e cria esse resultado.
- O incremental pode deixar passar um efeito indireto, por exemplo uma mudança de comportamento em código não mutado que afeta um mutante reaproveitado. A execução semanal pega esse caso em até uma semana.
- O cache do GitHub expira em 7 dias sem uso. A execução semanal mantém um resultado vivo.

## Quando revisar

- Se a execução completa passar de 45 min: dividir por módulo (sharding) ou rodar a completa em paralelo por módulo.
- Se a mutação semanal achar regressões com frequência: rodar a completa também em todo merge na `main`.
