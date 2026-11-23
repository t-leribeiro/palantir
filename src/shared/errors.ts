/** Erro de regra de negócio com código estável, seguro para expor em respostas da API. */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
