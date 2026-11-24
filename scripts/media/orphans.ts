// Objetos de mídia sem conversa (feature 006, T023): depois de apagar uma fonte, nada do prefixo
// `<space>/<source>/` pode sobrar no armazenamento. Só conta: nunca mostra chaves nem nomes.

/** Fonte dona de uma chave `<space>/<source>/<sha256>`, ou `null` se a chave não segue o formato. */
export function sourceOfKey(key: string): string | null {
  const parts = key.split("/");
  return parts.length === 3 && parts[1] ? parts[1] : null;
}

/** Quantas chaves pertencem a fontes que não existem mais (ou não seguem o formato). */
export function countOrphans(keys: readonly string[], existingSources: ReadonlySet<string>): number {
  return keys.filter((key) => {
    const source = sourceOfKey(key);
    return source === null || !existingSources.has(source);
  }).length;
}
