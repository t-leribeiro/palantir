export const PRESERVED: readonly string[];
export function parseEnv(text: string): Record<string, string>;
export function newSessionKey(): string;
export function mergeEnv(generated: string, previous: string, makeKey?: () => string): string;
