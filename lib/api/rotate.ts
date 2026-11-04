import { fetchJson } from './http';
import { markInstanceFailure, markInstanceSuccess } from './instances';

interface RotateOptions<T> {
  timeoutMs?: number;
  /** How many requests may be in flight at once. */
  concurrency?: number;
  /** Delay before starting another mirror, to let the first one answer. */
  staggerMs?: number;
  /** Return false to reject a response without treating it as a hard failure. */
  validate?: (data: T) => boolean;
  buildPath: (instance: string) => string;
}

interface RotateResult<T> {
  data: T;
  instance: string;
  attempts: string[];
}

/**
 * Rotates through API instances. Requests are staggered so a fast mirror wins
 * immediately while a dead mirror never blocks the whole lookup for 35 seconds.
 * The first response that passes `validate` wins; failures are cooled down by
 * the health layer in instances.ts.
 */
export async function rotateFetch<T>(
  instances: string[],
  options: RotateOptions<T>
): Promise<RotateResult<T>> {
  if (!instances.length) {
    throw new Error('No API instances configured');
  }

  const {
    timeoutMs = 5000,
    concurrency = 3,
    staggerMs = 450,
    validate,
    buildPath
  } = options;

  return new Promise<RotateResult<T>>((resolve, reject) => {
    const queue = [...instances];
    const attempts: string[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let active = 0;
    let started = 0;
    let settled = false;

    const finishWithError = () => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      reject(new Error(attempts.join(' | ') || 'All instances failed'));
    };

    const launch = () => {
      if (settled) return;

      while (active < concurrency && started < queue.length) {
        const instance = queue[started++];
        active += 1;

        const run = async () => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            let data: T;
            try {
              data = await fetchJson<T>(buildPath(instance), {
                timeoutMs,
                signal: controller.signal
              });
            } finally {
              clearTimeout(timeout);
            }

            if (validate && !validate(data)) {
              throw new Error('Response did not contain playable data');
            }

            if (settled) return;
            settled = true;
            timers.forEach(clearTimeout);
            markInstanceSuccess(instance);
            resolve({ data, instance, attempts });
          } catch (error) {
            if (!settled) {
              attempts.push(`${instance}: ${error instanceof Error ? error.message : String(error)}`);
              markInstanceFailure(instance, error);
            }
          } finally {
            active -= 1;
            if (settled) return;
            if (started < queue.length) {
              const timer = setTimeout(launch, staggerMs);
              timers.push(timer);
            } else if (active === 0) {
              finishWithError();
            }
          }
        };

        void run();
      }
    };

    launch();
  });
}
