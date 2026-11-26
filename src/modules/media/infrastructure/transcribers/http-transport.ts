// Transporte HTTP do motor de transcrição (BUG-20261125-B4B3): o `fetch` global do Node desiste aos 300 s esperando
// os cabeçalhos da resposta, e o motor só responde quando a transcrição termina. Sobre `node:http` e `node:https` não há
// esse prazo: o único limite é o `AbortSignal` do adaptador (o maior entre 120 s e 3× a duração). Mesma assinatura do
// `fetch`, para o adaptador e os testes não mudarem. Nada do corpo vai para log.
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";

/** Status em que o `Response` não aceita corpo. */
const NULL_BODY = new Set([101, 204, 205, 304]);

function headersOf(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) headers.append(name, item);
  }
  return headers;
}

/** Monta o pedido com o próprio Node, que serializa o `FormData` com o boundary do multipart. */
async function encode(input: string | URL | Request, init: RequestInit): Promise<{ url: URL; method: string; headers: Record<string, string>; body?: Buffer }> {
  const prepared = new Request(input, { method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body ?? null });
  const headers = Object.fromEntries(prepared.headers);
  if (!prepared.body) return { url: new URL(prepared.url), method: prepared.method, headers };
  const body = Buffer.from(await prepared.arrayBuffer());
  return { url: new URL(prepared.url), method: prepared.method, headers: { ...headers, "content-length": String(body.length) }, body };
}

export const requestWithoutHeadersTimeout: typeof fetch = async (input, init = {}) => {
  const { url, method, headers, body } = await encode(input, init);
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<Response>((resolve, reject) => {
    const req = send(url, { method, headers, ...(init.signal ? { signal: init.signal } : {}) }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        const status = res.statusCode ?? 502;
        resolve(new Response(NULL_BODY.has(status) ? null : Buffer.concat(chunks), { status, headers: headersOf(res.headers) }));
      });
    });
    req.on("error", reject);
    req.end(body);
  });
};
