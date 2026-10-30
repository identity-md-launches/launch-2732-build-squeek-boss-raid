import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address } from "viem";
import { RAID_START_BLOCK, SQK_TOKEN } from "./config";
import { getJson, readWheel, type Economy, type Status, type Wheel } from "./squeek";
import { MM_PER_DAMAGE, raidAddress, scoreAttacks, type AttackLog, type Hit } from "./raid";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const CHUNK = 20000n;
/** Rounds whose raid address is recognised when reading events. */
const ROUND_WINDOW = 5000n;

export type WheelRound = { round: string; wheelMm: number; startAt: number; fromStart: boolean };
export type Settled = { round: string; wheelDamage: number; fromStart: boolean; startAt: number };

const STORE = "sbr-wheel-v1";
const loadRounds = (): Record<string, WheelRound> => {
  try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; }
};
const saveRounds = (r: Record<string, WheelRound>) => {
  const keys = Object.keys(r).sort((a, b) => Number(b) - Number(a)).slice(0, 30);
  try { localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(keys.map((k) => [k, r[k]])))); } catch { /* private mode */ }
};

/** Live wheel and round from the Squeekchain API, plus the distance this browser saw per round. */
export function useSqueek(statusMs = 4000, economyMs = 10000) {
  const [wheel, setWheel] = useState<Wheel | null>(null);
  const [round, setRound] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Record<string, WheelRound>>(loadRounds);
  const [settled, setSettled] = useState<Settled | null>(null);
  const seenRound = useRef<bigint | null>(null);

  useEffect(() => {
    let alive = true;
    const pollStatus = async () => {
      try {
        const s = await getJson<Status>("/status");
        if (!alive) return;
        const w = readWheel(s);
        setWheel(w);
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Squeekchain API unreachable");
      }
    };
    const pollEconomy = async () => {
      try {
        const e = await getJson<Economy>("/economy/state");
        if (alive) setRound(BigInt(e.lifecycle.currentRound));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Squeekchain API unreachable");
      }
    };
    pollStatus();
    pollEconomy();
    const a = setInterval(pollStatus, statusMs), b = setInterval(pollEconomy, economyMs);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, [statusMs, economyMs]);

  // Add each new wheel sample's distance to the round it arrived in; the round number moving is a
  // settlement. distanceMm is a running counter: a smaller reading means it restarted, so the new
  // reading itself is the distance since the restart.
  const store = useRef(rounds);
  const lastSample = useRef<number | null>(null);
  useEffect(() => {
    if (round === null || !wheel) return;
    const key = round.toString();
    const next = { ...store.current };
    const prevSeen = seenRound.current;
    const prev = lastSample.current;
    const delta = prev === null ? 0 : wheel.distanceMm >= prev ? wheel.distanceMm - prev : wheel.distanceMm;
    lastSample.current = wheel.distanceMm;
    const cur = next[key];
    if (!cur || (prevSeen !== null && prevSeen !== round)) {
      const fromStart = prevSeen !== null && prevSeen === round - 1n;
      next[key] = { round: key, wheelMm: cur && !fromStart ? cur.wheelMm + delta : delta, startAt: Date.now(), fromStart };
    } else {
      next[key] = { ...cur, wheelMm: cur.wheelMm + delta, fromStart: prevSeen === null ? false : cur.fromStart };
    }
    if (prevSeen !== null && prevSeen < round && next[prevSeen.toString()]) {
      const r = next[prevSeen.toString()]!;
      setSettled({ round: r.round, wheelDamage: Math.floor(r.wheelMm / MM_PER_DAMAGE), fromStart: r.fromStart, startAt: r.startAt });
    }
    seenRound.current = round;
    store.current = next;
    saveRounds(next);
    setRounds(next);
  }, [round, wheel]);

  return { wheel, round, error, rounds, settled };
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

  const refresh = useCallback(async () => {
    if (!client || round === null || busy.current) return;
    busy.current = true;
    try {
      const lookup = new Map<string, bigint>();
      const lo = round > ROUND_WINDOW ? round - ROUND_WINDOW : 0n;
      for (let r = lo; r <= round + 2n; r++) lookup.set(raidAddress(r).toLowerCase(), r);
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
