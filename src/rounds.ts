import { parseAbi } from "viem";
import type { Core, Status } from "./squeek";

/** Fixed wheel calibration: public stats report 40,350,246 mm for 45,957 work units. */
export const MM_PER_WORK = 878n;

export const CORE_ROUND_ABI = parseAbi([
  "function roundPage(uint64 afterRound, uint64 throughRound, uint256 maxRecords) view returns ((uint64 certifiedThroughRound, (uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks) start, (uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks) end, (uint64 roundId, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks, bytes32 dataHash)[] rounds))",
]);

export function workDistance(work: bigint): number {
  const mm = work * MM_PER_WORK;
  if (work < 0n || mm > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid round distance");
  return Number(mm);
}

/** The API's open-round total already uses the shared round boundary, independent of join time.
 * distanceMm is a daily counter, so it must never be used as a browser-local round baseline.
 * Match the builder snapshot to the public genesis/duration so new work cannot hit the old boss.
 */
export function openRoundDistance(status: Status, core: Core, round: bigint): number | null {
  const measurement = status.measurement;
  const work = status.builder?.queued?.openRoundWorkUnits;
  if (!measurement || status.builder?.status !== "available" || work === undefined) return null;
  const observed = Date.parse(status.generatedAt ?? measurement.observedAt);
  if (!Number.isFinite(observed)) return null;
  const seconds = BigInt(Math.floor(observed / 1000));
  const genesis = BigInt(core.configuration.genesisTimestamp);
  const duration = BigInt(core.configuration.roundDuration);
  if (duration <= 0n || seconds < genesis || (seconds - genesis) / duration + 1n !== round) return null;
  return workDistance(BigInt(work));
}

/** Cumulative positions bracket exactly one certified round, including a certified zero-work round. */
export function settledRoundDistance(page: {
  certifiedThroughRound: bigint;
  start: { cumulativeWork: bigint };
  end: { cumulativeWork: bigint };
}, round: bigint): number {
  if (page.certifiedThroughRound !== round) throw new Error("Round not yet certified");
  return workDistance(page.end.cumulativeWork - page.start.cumulativeWork);
}
