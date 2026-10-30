import { describe, expect, it } from "vitest";
import { openRoundDistance, settledRoundDistance, workDistance } from "../src/rounds";
import { readWheel, type Core, type Status } from "../src/squeek";
import { cooldownLeft, leaderboard, scoreAttacks } from "../src/raid";

const at = Date.parse("2026-10-30T16:00:00Z");
const core: Core = {
  identities: { core: "0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44" },
  configuration: { genesisTimestamp: String(at / 1000 - 587 * 600 - 60), roundDuration: "600" },
  core: { settledThroughRound: "587" },
};
function sample(distanceMm = 301000, work = "343"): Status {
  return {
    measurement: { coreStatus: "RUNNING", observedAt: new Date(at).toISOString(), staleAfterSeconds: 120, distanceMm, speedMmPerSecond: 1000 },
    builder: { status: "available", queued: { openRoundWorkUnits: work } },
  };
}

describe("shared wheel totals", () => {
  it("gives every visitor the full open-round work regardless of daily distance or previous readings", () => {
    expect(openRoundDistance(sample(), core, 588n)).toBe(301154);
    expect(openRoundDistance(sample(1), core, 588n)).toBe(301154);
    expect(openRoundDistance(sample(0), core, 588n)).toBe(301154);
  });
  it("does not carry work from an old sample into a new round", () => {
    expect(openRoundDistance(sample(), core, 589n)).toBeNull();
    const next = sample(1000, "1");
    next.measurement!.observedAt = new Date(at + 600000).toISOString();
    expect(openRoundDistance(next, core, 588n)).toBeNull();
    expect(openRoundDistance(next, core, 589n)).toBe(878);
  });
  it("keeps already recorded damage when telemetry expires", () => {
    const s = sample();
    expect(readWheel(s, at + 180000)?.stale).toBe(true);
    expect(openRoundDistance(s, core, 588n)).toBe(301154);
  });
  it("uses the builder snapshot's round when the sensor's last observation is older", () => {
    const s = sample(0, "0");
    s.generatedAt = new Date(at + 600000).toISOString();
    expect(openRoundDistance(s, core, 588n)).toBeNull();
    expect(openRoundDistance(s, core, 589n)).toBe(0);
  });
  it("leaves an unavailable round total unknown, including missing builder data", () => {
    expect(openRoundDistance({ measurement: sample().measurement }, core, 588n)).toBeNull();
    expect(openRoundDistance({ ...sample(), builder: { status: "unavailable" } }, core, 588n)).toBeNull();
    expect(openRoundDistance({ measurement: null }, core, 588n)).toBeNull();
  });
  it("uses the identical canonical distance for a certified summary, including zero-work rounds", () => {
    const page = { certifiedThroughRound: 588n, start: { cumulativeWork: 1000n }, end: { cumulativeWork: 1343n } };
    expect(settledRoundDistance(page, 588n)).toBe(openRoundDistance(sample(), core, 588n));
    expect(settledRoundDistance({ ...page, end: page.start }, 588n)).toBe(0);
    expect(() => settledRoundDistance(page, 589n)).toThrow("not yet certified");
  });
  it("rejects invalid or unsafe work totals instead of inventing damage", () => {
    expect(() => workDistance(-1n)).toThrow();
    expect(() => workDistance(2n ** 64n)).toThrow();
    expect(openRoundDistance(sample(0, "0"), core, 588n)).toBe(0);
  });
});

describe("telemetry freshness", () => {
  it("expires at the deadline without needing a new sample or a successful request", () => {
    const s = sample();
    expect(readWheel(s, at + 119999)?.running).toBe(true);
    const expired = readWheel(s, at + 120000);
    expect(expired).toMatchObject({ stale: true, running: false, speedMmPerSecond: 0, distanceMm: 301000 });
  });
  it("accepts a fresh recovery, and distinguishes rest from unavailable telemetry", () => {
    const s = sample();
    s.measurement!.observedAt = new Date(at + 180000).toISOString();
    expect(readWheel(s, at + 180001)?.running).toBe(true);
    s.measurement!.coreStatus = "IDLE"; s.measurement!.speedMmPerSecond = 0;
    expect(readWheel(s, at + 180001)).toMatchObject({ stale: false, running: false, speedMmPerSecond: 0 });
    expect(readWheel({ measurement: null }, at)).toBeNull();
  });
  it("fails closed for invalid timestamps and expiry values", () => {
    const s = sample();
    s.measurement!.observedAt = "invalid";
    expect(readWheel(s, at)?.stale).toBe(true);
    s.measurement!.observedAt = new Date(at).toISOString(); s.measurement!.staleAfterSeconds = "invalid";
    expect(readWheel(s, at)?.stale).toBe(true);
  });
});

it("counts historical and current attacks, keeping a wallet's cooldown across rounds", () => {
  const attacker = "0x1111111111111111111111111111111111111111" as const;
  const txHash = "0x00000000000000000000000000000000000000000000000000000000000001f4" as const;
  const hits = scoreAttacks([
    { attacker, txHash, round: 1n, block: 100n, logIndex: 0 },
    { attacker, txHash, round: 5011n, block: 124n, logIndex: 0 },
    { attacker, txHash, round: 5011n, block: 125n, logIndex: 0 },
  ]);
  expect(hits.map((h) => h.damage)).toEqual([1000, 0, 1000]);
  expect(leaderboard(hits)[0]?.damage).toBe(2000);
  expect(leaderboard(hits, 5011n)[0]?.damage).toBe(1000);
  expect(cooldownLeft(hits, attacker, 149n)).toBe(1n);
  expect(cooldownLeft(hits, attacker, 150n)).toBe(0n);
});
