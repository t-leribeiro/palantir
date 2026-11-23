// Ritmo de envio por destinatário (feature 003: RF-09, D-12). Partes de uma resposta saem em ordem, com
// intervalo mínimo entre elas; destinatários diferentes não esperam uns pelos outros.

export interface PacerClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemPacerClock: PacerClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface SendPacer {
  send(recipient: string, task: () => Promise<void>): Promise<void>;
}

export interface SendPacerOptions {
  readonly minIntervalMs?: number;
  readonly clock?: PacerClock;
}

export function createSendPacer(options: SendPacerOptions = {}): SendPacer {
  const minIntervalMs = options.minIntervalMs ?? 1000;
  const clock = options.clock ?? systemPacerClock;
  const queues = new Map<string, Promise<void>>();
  const lastSentAt = new Map<string, number>();

  async function paced(recipient: string, task: () => Promise<void>): Promise<void> {
    const last = lastSentAt.get(recipient);
    const wait = last === undefined ? 0 : last + minIntervalMs - clock.now();
    if (wait > 0) await clock.sleep(wait);
    lastSentAt.set(recipient, clock.now());
    await task();
  }

  return {
    send(recipient, task) {
      const previous = queues.get(recipient) ?? Promise.resolve();
      const run = previous.then(() => paced(recipient, task));
      const settled = run.catch(() => undefined);
      queues.set(recipient, settled);
      void settled.then(() => {
        if (queues.get(recipient) === settled) queues.delete(recipient);
      });
      return run;
    },
  };
}
