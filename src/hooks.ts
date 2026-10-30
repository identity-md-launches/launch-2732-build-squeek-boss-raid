import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address } from "viem";
import { RAID_START_BLOCK, SQK_TOKEN } from "./config";
import { getJson, readWheel, type Core, type Economy, type Status } from "./squeek";
import { MM_PER_DAMAGE, raidAddress, scoreAttacks, type AttackLog, type Hit } from "./raid";
import { CORE_ROUND_ABI, openRoundDistance, settledRoundDistance } from "./rounds";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const CHUNK = 20000n;
export type WheelRound = { round: string; wheelMm: number };
export type Settled = { round: string; wheelDamage: number | null };

/** Live telemetry and shared round work, with final totals certified by SqueekCore. */
export function useSqueek(statusMs = 4000, economyMs = 10000) {
  const client = usePublicClient();
  const [status, setStatus] = useState<Status | null>(null);
  const [now, setNow] = useState(Date.now);
  const [round, setRound] = useState<bigint | null>(null);
  const [core, setCore] = useState<Core | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roundError, setRoundError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Record<string, WheelRound>>({});
  const [settled, setSettled] = useState<Settled | null>(null);
  // Expire retained samples even when every subsequent request fails or a tab resumes later.
  const wheel = status ? readWheel(status, now) : null;

  useEffect(() => {
    let alive = true;
    const pollStatus = async () => {
      try {
        const s = await getJson<Status>("/status");
        if (!alive) return;
        setStatus(s);
        setNow(Date.now());
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Squeekchain API unreachable");
      }
    };
    const pollEconomy = async () => {
      try {
        const e = await getJson<Economy>("/economy/state");
        if (alive) setRound(BigInt(e.lifecycle.currentRound));
        const c = await getJson<Core>("/core");
        if (alive) { setCore(c); setRoundError(null); }
      } catch (e) {
        if (alive) setRoundError(e instanceof Error ? e.message : "Round data unavailable");
      }
    };
    pollStatus();
    pollEconomy();
    const a = setInterval(pollStatus, statusMs), b = setInterval(pollEconomy, economyMs);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(a); clearInterval(b); clearInterval(clock); };
  }, [statusMs, economyMs]);

  useEffect(() => {
    if (round === null || !core) return;
    let alive = true;
    const readDistance = async (r: bigint) => {
      if (!client) throw new Error("Sepolia RPC unavailable");
      const page = await client.readContract({ address: core.identities.core, abi: CORE_ROUND_ABI,
        functionName: "roundPage", args: [r - 1n, r, 1n] });
      return settledRoundDistance(page, r);
    };
    const update = async () => {
      try {
        const frontier = BigInt(core.core.settledThroughRound);
        const mm = round <= frontier ? await readDistance(round) : status ? openRoundDistance(status, core, round) : null;
        if (!alive) return;
        // Replace the canonical total, never add deltas or consult localStorage.
        setRounds(mm === null ? {} : { [round.toString()]: { round: round.toString(), wheelMm: mm } });
        if (round > 1n) {
          const previous = round - 1n;
          if (previous > frontier) { setSettled({ round: previous.toString(), wheelDamage: null }); return; }
          const finalMm = await readDistance(previous);
          if (alive) setSettled({ round: previous.toString(), wheelDamage: Math.floor(finalMm / MM_PER_DAMAGE) });
        }
      } catch (e) {
        if (alive) setRoundError(e instanceof Error ? e.message.split("\n")[0]! : "Round total unavailable");
      }
    };
    // A new round's summary stays pending until its canonical total has been read.
    if (round > 1n) setSettled((s) => s?.round === (round - 1n).toString() ? s : { round: (round - 1n).toString(), wheelDamage: null });
    void update();
    return () => { alive = false; };
  }, [round, status, core, client]);

  return { wheel, round, error, roundError, rounds, settled };
}

/** Every raid attack since launch, read from SQK Transfer events to the per-round raid addresses. */
export function useAttacks(round: bigint | null, pollMs = 12000) {
  const client = usePublicClient();
  const [hits, setHits] = useState<Hit[]>([]);
  const [latest, setLatest] = useState<bigint>(0n);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const logs = useRef<AttackLog[]>([]);
  const scanned = useRef<bigint>(RAID_START_BLOCK - 1n);
  const busy = useRef(false);
  const raidRounds = useRef(new Map<string, bigint>());
  const nextRound = useRef(0n);

  const refresh = useCallback(async () => {
    if (!client || round === null || busy.current) return;
    busy.current = true;
    try {
      // Retain every round since launch; extend once rather than hashing history every poll.
      const lookup = raidRounds.current;
      for (; nextRound.current <= round + 2n; nextRound.current++) {
        const r = nextRound.current;
        lookup.set(raidAddress(r).toLowerCase(), r);
      }
      const head = await client.getBlockNumber();
      for (let from = scanned.current + 1n; from <= head; from += CHUNK) {
        const to = from + CHUNK - 1n < head ? from + CHUNK - 1n : head;
        const found = await client.getLogs({ address: SQK_TOKEN, event: TRANSFER, fromBlock: from, toBlock: to });
        for (const l of found) {
          const r = l.args.to ? lookup.get(l.args.to.toLowerCase()) : undefined;
          if (r === undefined || !l.args.from || l.args.value !== 0n || l.blockNumber === null || !l.transactionHash) continue;
          logs.current.push({ attacker: l.args.from as Address, round: r, block: l.blockNumber, txHash: l.transactionHash, logIndex: l.logIndex ?? 0 });
        }
        scanned.current = to;
      }
      setHits(scoreAttacks(logs.current));
      setLatest(head);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0]! : "Sepolia RPC unreachable");
    } finally {
      busy.current = false;
    }
  }, [client, round]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { hits, latest, error, loaded, refresh };
}
