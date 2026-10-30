import { getAddress, keccak256, toBytes, type Address, type Hex } from "viem";

/** Wheel damage: one point per centimetre the real hamster runs during the round. */
export const MM_PER_DAMAGE = 10;
/** Blocks a wallet waits between counted attacks (Sepolia makes a block about every 12 s). */
export const COOLDOWN_BLOCKS = 25n;
export const COOLDOWN_SECONDS = 25 * 12;
/** A counted attack deals a base hit plus a bonus read from its transaction hash. */
export const HIT_BASE = 500;
export const HIT_SPREAD = 500;

/**
 * The address an attack on `round` is sent to. It is the tail of a public hash, so nobody holds
 * its key; the attack moves 0 SQK and exists only to emit a Transfer event naming the attacker.
 */
export function raidAddress(round: bigint): Address {
  return getAddress(`0x${keccak256(toBytes(`squeek-boss-raid:v1:round:${round}`)).slice(-40)}`);
}

export function hitDamage(txHash: Hex): number {
  return HIT_BASE + (parseInt(txHash.slice(-4), 16) % (HIT_SPREAD + 1));
}

export type AttackLog = { attacker: Address; round: bigint; block: bigint; txHash: Hex; logIndex: number };
export type Hit = AttackLog & { counted: boolean; damage: number };

/** Apply the cooldown in block order: an attack inside a wallet's cooldown is recorded but deals 0. */
export function scoreAttacks(logs: AttackLog[]): Hit[] {
  const sorted = [...logs].sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1));
  const last = new Map<string, bigint>();
  return sorted.map((l) => {
    const key = l.attacker.toLowerCase();
    const prev = last.get(key);
    const counted = prev === undefined || l.block - prev >= COOLDOWN_BLOCKS;
    if (counted) last.set(key, l.block);
    return { ...l, counted, damage: counted ? hitDamage(l.txHash) : 0 };
  });
}

export type Row = { attacker: Address; damage: number; hits: number };

export function leaderboard(hits: Hit[], round?: bigint): Row[] {
  const rows = new Map<string, Row>();
  for (const h of hits) {
    if (round !== undefined && h.round !== round) continue;
    const key = h.attacker.toLowerCase();
    const row = rows.get(key) ?? { attacker: h.attacker, damage: 0, hits: 0 };
    row.damage += h.damage;
    if (h.counted) row.hits += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.damage - a.damage || b.hits - a.hits);
}

/** Blocks left before `wallet` can land a counted hit again, given the latest block. */
export function cooldownLeft(hits: Hit[], wallet: Address | undefined, latest: bigint): bigint {
  if (!wallet) return 0n;
  const mine = hits.filter((h) => h.counted && h.attacker.toLowerCase() === wallet.toLowerCase());
  if (!mine.length) return 0n;
  const lastBlock = mine[mine.length - 1]!.block;
  const left = lastBlock + COOLDOWN_BLOCKS - latest;
  return left > 0n ? left : 0n;
}

// ---------- the Boss: name, HP and look all follow from the round number

const PREFIX = ["Gnaw", "Grim", "Mold", "Rust", "Soot", "Brie", "Thorn", "Murk", "Fang", "Crumb", "Bog", "Frost"];
const SUFFIX = ["whisker", "maw", "claw", "tail", "fang", "snout", "paw", "tooth"];
const TITLE = ["the Cheese Thief", "of the Burrow", "the Wheel Jammer", "the Seed Hoarder", "the Cage Rattler", "of Rust Hollow", "the Pellet Tyrant", "the Night Prowler"];
const PALETTES = [
  { body: "#7a5bb5", dark: "#4a3378", belly: "#c9b5ec" },
  { body: "#4f8f6a", dark: "#2c5a3f", belly: "#b5dec4" },
  { body: "#b5523b", dark: "#6e2a1c", belly: "#f0b9a6" },
  { body: "#3f6fae", dark: "#22406b", belly: "#aecdf0" },
  { body: "#8a8a8a", dark: "#4d4d4d", belly: "#d9d9d9" },
  { body: "#a8762e", dark: "#5e3f12", belly: "#ecd3a2" },
];
const EYES = ["#ffd23f", "#ff5a5a", "#7dffb0", "#7fd8ff"];

export type Boss = {
  round: bigint;
  name: string;
  title: string;
  hp: number;
  palette: (typeof PALETTES)[number];
  eye: string;
  crown: 0 | 1 | 2;
};

export function bossFor(round: bigint): Boss {
  const h = keccak256(toBytes(`squeek-boss-raid:v1:boss:${round}`));
  const b = (i: number) => parseInt(h.slice(2 + i * 2, 4 + i * 2), 16);
  const name = PREFIX[b(0) % PREFIX.length]! + SUFFIX[b(1) % SUFFIX.length]!;
  return {
    round,
    name,
    title: TITLE[b(2) % TITLE.length]!,
    // 15,000 to 25,000 HP: 150 to 250 metres of wheel running, before player hits
    hp: 15000 + Math.round((b(3) * 256 + b(4)) / 65535 * 10000),
    palette: PALETTES[b(5) % PALETTES.length]!,
    eye: EYES[b(6) % EYES.length]!,
    crown: (b(7) % 3) as 0 | 1 | 2,
  };
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
