/** Primeira linha de um resultado; falha o teste com mensagem clara se não houver (evita `!`). */
export function one<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("esperava ao menos uma linha");
  return row;
}
