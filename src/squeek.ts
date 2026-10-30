import { API_BASES } from "./config";

/** The fields of /v1/status this game reads. */
export type Status = {
  measurement: {
    coreStatus: string;
    speedMmPerSecond: number;
    rpmMilli?: number;
    distanceMm: number;
    observedAt: string;
    staleAfterSeconds?: number | string;
  };
  builder?: { anchor?: { blockHeight: string; settledThroughRound?: string } };
};

/** The fields of /v1/economy/state this game reads. */
export type Economy = {
  lifecycle: { currentRound: string; paused?: boolean; stage?: string };
  chain?: { safeThroughBlock?: string };
};

export type Wheel = {
  running: boolean;
  stale: boolean;
  speedMmPerSecond: number;
  distanceMm: number;
  observedAt: number;
};

let preferred = 0;

/** GET a Squeekchain API path, trying the brief's host first and the api. host second. */
export async function getJson<T>(path: string): Promise<T> {
  let last: unknown;
  for (let i = 0; i < API_BASES.length; i++) {
    const base = API_BASES[(preferred + i) % API_BASES.length];
    try {
      const res = await fetch(`${base}${path}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) throw new Error(`${path} answered ${res.status}`);
      const body = (await res.json()) as T & { status?: string; reason?: string };
      if (body && body.status === "unavailable") throw new Error(body.reason || `${path} is unavailable`);
      preferred = (preferred + i) % API_BASES.length;
      return body;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Squeekchain API unreachable");
}

export function readWheel(s: Status, now = Date.now()): Wheel {
  const m = s.measurement;
  const observedAt = Date.parse(m.observedAt);
  const staleAfter = Number(m.staleAfterSeconds ?? 60);
  const stale = !Number.isFinite(observedAt) || (now - observedAt) / 1000 > staleAfter;
  const speed = Number(m.speedMmPerSecond) || 0;
  return {
    running: !stale && m.coreStatus !== "IDLE" && speed > 0,
    stale,
    speedMmPerSecond: stale ? 0 : speed,
    distanceMm: Number(m.distanceMm) || 0,
    observedAt,
  };
}
