// Números de telefone em E.164 (feature 003, D-07). Compartilhado pela identidade (cadastro) e pelos
// canais (remetente), para que os dois lados comparem a mesma forma.

const E164 = /^\+[1-9]\d{7,14}$/;
const ALLOWED = /^\+?[\d\s().-]+$/;
/** Celular brasileiro antigo, sem o nono dígito: 55 + DDD + 8 dígitos começando por 6 a 9. */
const BR_MOBILE_WITHOUT_NINTH = /^55([1-9][1-9])([6-9]\d{7})$/;
const BR_MOBILE = /^55(\d{2})(\d)\d{6}(\d{2})$/;

/** Devolve o número em E.164 (`+5511988887777`) ou `null` quando não é um número internacional. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!ALLOWED.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "").replace(BR_MOBILE_WITHOUT_NINTH, "55$19$2");
  const e164 = `+${digits}`;
  return E164.test(e164) ? e164 : null;
}

/** Forma segura para logs e saídas de comando: nunca o número inteiro. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const br = digits.length === 13 ? BR_MOBILE.exec(digits) : null;
  if (br) return `+55 ${br[1]} ${br[2]}****-**${br[3]}`;
  return `+${digits.slice(0, 2)}${"*".repeat(Math.max(digits.length - 4, 1))}${digits.slice(-2)}`;
}
