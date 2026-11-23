// eslint-disable-next-line complexity -- tabela de faixas legada, coberta por testes
export function classify(n: number, flag: boolean): string {
  if (n > 10) return "a";
  if (n > 9) return "b";
  if (n > 8) return "c";
  if (n > 7) return "d";
  if (n > 6) return "e";
  if (n > 5) return "f";
  if (n > 4) return "g";
  if (n > 3) return "h";
  if (n > 2) return "i";
  return flag ? "j" : "k";
}
