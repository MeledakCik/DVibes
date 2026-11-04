/**
 * Instance rotation with a small health/backoff layer.
 *
 * The public order is always preserved, but recently failing instances are
 * pushed behind healthy ones so one dead public mirror does not add a 5 second
 * penalty to every request. If every instance is marked down we still try the
 * whole list, because mirrors recover all the time.
 */

const DEFAULT_PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.ducks.party',
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi.drgns.space',
  'https://pipedapi.smnz.de'
];

const FAILURE_COOLDOWN_MS = 2 * 60 * 1000;
const MAX_COOLDOWN_MS = 12 * 60 * 1000;

interface Health {
  failures: number;
  downUntil: number;
  lastError?: string;
}

const health = new Map<string, Health>();

export function parseInstanceList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter((value) => /^https?:\/\//i.test(value))
    .filter((value, index, list) => list.indexOf(value) === index);
}

export function getPipedInstances(): string[] {
  return prioritize(DEFAULT_PIPED_INSTANCES);
}

export function prioritize(instances: string[]): string[] {
  const now = Date.now();
  const healthy: string[] = [];
  const cooling: string[] = [];

  for (const instance of instances) {
    const item = health.get(instance);
    if (!item || item.downUntil <= now) healthy.push(instance);
    else cooling.push(instance);
  }

  return healthy.length ? [...healthy, ...cooling] : [...instances];
}

export function markInstanceSuccess(instance: string): void {
  health.delete(instance);
}

export function markInstanceFailure(instance: string, error: unknown): void {
  const current = health.get(instance) ?? { failures: 0, downUntil: 0 };
  const failures = current.failures + 1;
  const cooldown = Math.min(FAILURE_COOLDOWN_MS * failures, MAX_COOLDOWN_MS);
  health.set(instance, {
    failures,
    downUntil: Date.now() + cooldown,
    lastError: error instanceof Error ? error.message : String(error)
  });
}

export function getInstanceHealth(): Array<{ instance: string; failures: number; down: boolean }> {
  return Array.from(health.entries()).map(([instance, value]) => ({
    instance,
    failures: value.failures,
    down: value.downUntil > Date.now()
  }));
}
