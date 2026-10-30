import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { erc20Abi } from "viem";
import { chain, SQK_TOKEN } from "./config";
import { ConnectSheet } from "./ConnectSheet";
import { BossSprite, HamsterWheel } from "./Sprites";
import { useAttacks, useSqueek, type Settled } from "./hooks";
import {
  bossFor, cooldownLeft, COOLDOWN_SECONDS, HIT_BASE, HIT_SPREAD, leaderboard, MM_PER_DAMAGE, raidAddress, short,
  type Hit, type Row,
} from "./raid";

const nf = new Intl.NumberFormat("en-US");
const EXPLORER = "https://sepolia.etherscan.io";

export function App() {
  const { wheel, round, error: apiError, roundError, rounds, settled } = useSqueek();
  const { hits, latest, error: rpcError, loaded, refresh } = useAttacks(round);
  const boss = useMemo(() => (round === null ? null : bossFor(round)), [round]);

  const wheelMm = round === null ? undefined : rounds[round.toString()]?.wheelMm;
  const wheelDamage = wheelMm === undefined ? null : Math.floor(wheelMm / MM_PER_DAMAGE);
  const roundHits = useMemo(() => (round === null ? [] : hits.filter((h) => h.round === round)), [hits, round]);
  const playerDamage = roundHits.reduce((s, h) => s + h.damage, 0);
  const total = wheelDamage === null || !loaded ? null : wheelDamage + playerDamage;
  const hpLeft = boss && total !== null ? Math.max(0, boss.hp - total) : null;
  const pct = boss && hpLeft !== null ? (hpLeft / boss.hp) * 100 : 100;
  const dps = wheel ? wheel.speedMmPerSecond / MM_PER_DAMAGE : 0;
  const liveWheel = wheel && !wheel.stale && !apiError;

  // A short shake on the Boss whenever a new hit lands or the wheel deals damage.
  const [hurt, setHurt] = useState(false);
  const lastTotal = useRef(total);
  useEffect(() => {
    if (total !== null && lastTotal.current !== null && total > lastTotal.current) {
      setHurt(true);
      const t = setTimeout(() => setHurt(false), 300);
      lastTotal.current = total;
      return () => clearTimeout(t);
    }
    lastTotal.current = total;
  }, [total]);

  return (
    <>
      <a className="skip" href="#raid">Skip to the raid</a>
      <header className="top">
        <a className="logo" href="#raid">
          <img src="./favicon.svg" width={28} height={28} alt="" />
          <span>Squeek Boss Raid</span>
        </a>
        <nav className="top-nav" aria-label="Page">
          <a href="#how">How to play</a>
          <ConnectSheet />
        </nav>
      </header>

      <main id="raid">
        <section className="arena" aria-labelledby="boss-name">
          <div className="arena-head">
            <h1 id="boss-name">{boss ? boss.name : "Summoning the Boss…"}</h1>
            <p className="sub">
              {boss ? <>{boss.title} · Squeekchain round <span className="num">{nf.format(Number(boss.round))}</span></> : "Reading the round from Squeekchain"}
            </p>
          </div>

          <div className="stage">
            {boss ? <BossSprite boss={boss} hurt={hurt} /> : <div className="boss-sprite placeholder" aria-hidden="true" />}
            <div className="hp">
              <div className="hp-label">
                <span>Boss HP</span>
                <span className="num">{boss && hpLeft !== null ? `${nf.format(hpLeft)} / ${nf.format(boss.hp)}` : wheelDamage === null ? "Awaiting wheel total" : "Reading attacks"}</span>
              </div>
              <div className="hp-track" role="progressbar" aria-label="Boss HP left" aria-valuemin={0} aria-valuemax={boss?.hp ?? undefined} aria-valuenow={hpLeft ?? undefined} aria-valuetext={hpLeft === null ? "Reading shared damage totals" : undefined}>
                <div className="hp-fill" style={{ width: `${pct}%` }} />
              </div>
              {boss && hpLeft === 0 && <p className="note good" role="status">Defeated. A new Boss spawns when Squeekchain settles this round.</p>}
            </div>
          </div>

          <div className="wheel-row">
            <HamsterWheel running={!!liveWheel && wheel.running} />
            <dl className="stats">
              <div><dt>Wheel speed</dt><dd className="num">{liveWheel ? `${(wheel.speedMmPerSecond * 0.0036).toFixed(2)} km/h` : "Unavailable"}</dd></div>
              <div><dt>Hamster damage</dt><dd className="num">{liveWheel ? `${nf.format(Math.round(dps))} per s` : "Unavailable"}</dd></div>
              <div><dt>Wheel hits this round</dt><dd className="num">{wheelDamage === null ? "Pending" : nf.format(wheelDamage)}</dd></div>
              <div><dt>Player hits this round</dt><dd className="num">{nf.format(playerDamage)}</dd></div>
            </dl>
          </div>
          <p className="fine" aria-live="polite">
            {apiError || wheel?.stale
              ? "Live wheel unavailable. Retrying."
              : roundError || wheelDamage === null
                ? "Shared round total unavailable. Retrying."
                : wheel && !wheel.running
                  ? "The hamster is resting. Wheel damage resumes when it runs."
                  : "Wheel damage counted from the shared start of this round."}
          </p>

          <AttackPanel round={round} hits={hits} latest={latest} onLanded={refresh} />
        </section>

        <Boards hits={hits} round={round} loaded={loaded} error={rpcError} />
        <Summary settled={settled} hits={hits} loaded={loaded} />
        <HowTo />
      </main>

      <footer className="foot">
        <p>
          Live wheel from the <a href="https://squeekchain.com">Squeekchain</a> API. Attacks are 0 SQK transfers on Sepolia to a per-round raid address, read back from the{" "}
          <a href={`${EXPLORER}/token/${SQK_TOKEN}`}>SQK token's events</a>. A fan-made game, not run by Squeekchain.
        </p>
      </footer>
    </>
  );
}

function AttackPanel({ round, hits, latest, onLanded }: { round: bigint | null; hits: Hit[]; latest: bigint; onLanded: () => void }) {
  const { address, isConnected, chainId } = useAccount();
  const { writeContract, data: hash, isPending: signing, error: writeError, reset } = useWriteContract();
  const { isLoading: mining, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash, chainId: chain.id });
  const left = cooldownLeft(hits, address, latest);
  const [, tick] = useState(0);
  useEffect(() => { if (isSuccess) onLanded(); }, [isSuccess, onLanded]);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 12000); return () => clearInterval(t); }, []);

  const landed = hash ? hits.find((h) => h.txHash.toLowerCase() === hash.toLowerCase()) : undefined;
  const wrongChain = isConnected && chainId !== chain.id;
  const disabled = !isConnected || wrongChain || round === null || signing || mining || left > 0n;

  const attack = () => {
    if (round === null) return;
    reset();
    writeContract({ address: SQK_TOKEN, abi: erc20Abi, functionName: "transfer", args: [raidAddress(round), 0n], chainId: chain.id });
  };

  let label = "Attack";
  if (signing) label = "Confirm in your wallet…";
  else if (mining) label = "Hit on its way…";
  else if (left > 0n) label = `Cooldown · about ${Math.max(1, Math.round((Number(left) * 12) / 60))} min`;

  return (
    <div className="attack">
      <button className="btn btn-attack" onClick={attack} disabled={disabled} aria-describedby="attack-help">
        {label}
      </button>
      <p id="attack-help" className="fine" aria-live="polite">
        {!isConnected
          ? `Connect a Sepolia wallet to attack. Each hit is a 0 ETH transaction; you pay only gas.`
          : wrongChain
            ? `Switch your wallet to ${chain.name} to attack.`
            : round === null
              ? "Waiting for the round number from Squeekchain."
              : writeError
                ? attackError(writeError)
                : mining && hash
                  ? <>Sent. <a href={`${EXPLORER}/tx/${hash}`}>View it on Etherscan</a>. It lands in about 12 seconds.</>
                  : isSuccess && hash
                    ? landed
                      ? landed.counted
                        ? <>Hit landed for <strong className="num">{nf.format(landed.damage)}</strong> damage. <a href={`${EXPLORER}/tx/${hash}`}>Transaction</a>.</>
                        : <>Recorded, but it came inside your cooldown, so it deals 0. <a href={`${EXPLORER}/tx/${hash}`}>Transaction</a>.</>
                      : <>Confirmed in block {receipt?.blockNumber.toString()}. The boards pick it up on the next read.</>
                    : left > 0n
                      ? `Your next counted hit opens in ${left} Sepolia blocks.`
                      : `Your wallet shows a 0 SQK transfer to the round's raid address. Hits deal ${HIT_BASE} to ${HIT_BASE + HIT_SPREAD} damage.`}
      </p>
    </div>
  );
}

function attackError(e: Error): string {
  const m = `${e.name} ${e.message}`.toLowerCase();
  if (m.includes("reject") || m.includes("denied") || m.includes("cancel")) return "You cancelled the attack. Press Attack to try again.";
  if (m.includes("insufficient funds")) return "Your wallet needs a little Sepolia ETH for gas. Get some from a Sepolia faucet, then attack.";
  return "The attack did not go through. Check your wallet and press Attack again.";
}

function Boards({ hits, round, loaded, error }: { hits: Hit[]; round: bigint | null; loaded: boolean; error: string | null }) {
  const [tab, setTab] = useState<"round" | "all">("round");
  const rows = useMemo(() => leaderboard(hits, tab === "round" ? round ?? -1n : undefined), [hits, round, tab]);
  const tabs = [{ id: "round", name: "This round" }, { id: "all", name: "All time" }] as const;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const next = tab === "round" ? "all" : "round";
      setTab(next);
      document.getElementById(`tab-${next}`)?.focus();
    }
  };
  return (
    <section className="panel" aria-labelledby="boards-title">
      <h2 id="boards-title">Damage leaderboard</h2>
      <div className="tabs" role="tablist" aria-label="Leaderboard period" onKeyDown={onKey}>
        {tabs.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls="board" tabIndex={tab === t.id ? 0 : -1} className="tab" onClick={() => setTab(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
      <div id="board" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {error && !loaded ? (
          <p className="fine">Sepolia did not answer ({error}). Retrying.</p>
        ) : !loaded ? (
          <p className="fine">Reading attack events from Sepolia…</p>
        ) : rows.length === 0 ? (
          <p className="fine">{tab === "round" ? "No player has hit this Boss yet. Connect and land the first hit." : "No attacks yet. The first hit takes the top spot."}</p>
        ) : (
          <Table rows={rows.slice(0, 20)} />
        )}
      </div>
    </section>
  );
}

function Table({ rows }: { rows: Row[] }) {
  const { address } = useAccount();
  return (
    <table className="board">
      <thead>
        <tr><th scope="col">#</th><th scope="col">Wallet</th><th scope="col" className="r">Hits</th><th scope="col" className="r">Damage</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.attacker} className={address && r.attacker.toLowerCase() === address.toLowerCase() ? "me" : undefined}>
            <td className="num">{i + 1}</td>
            <td><a className="mono" href={`${EXPLORER}/address/${r.attacker}`}>{short(r.attacker)}</a></td>
            <td className="num r">{r.hits}</td>
            <td className="num r">{nf.format(r.damage)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Summary({ settled, hits, loaded }: { settled: Settled | null; hits: Hit[]; loaded: boolean }) {
  if (!settled) {
    return (
      <section className="panel" aria-labelledby="summary-title">
        <h2 id="summary-title">Round summary</h2>
        <p className="fine">When Squeekchain settles this round, the result and the top attackers appear here. Keep the page open to see it.</p>
      </section>
    );
  }
  const r = BigInt(settled.round);
  const boss = bossFor(r);
  const rows = leaderboard(hits, r);
  const players = rows.reduce((s, x) => s + x.damage, 0);
  if (settled.wheelDamage === null || !loaded) {
    return (
      <section className="panel summary" aria-labelledby="summary-title" aria-live="polite">
        <h2 id="summary-title">Round {nf.format(Number(r))} result pending</h2>
        <p className="fine">{!loaded ? "Reading this round's attacks from Sepolia. The result appears when the scan completes." : "Waiting for the shared wheel total to settle on Sepolia. The result appears after it is confirmed."}</p>
      </section>
    );
  }
  const total = settled.wheelDamage + players;
  const won = total >= boss.hp;
  return (
    <section className={`panel summary ${won ? "won" : "lost"}`} aria-labelledby="summary-title" aria-live="polite">
      <h2 id="summary-title">{won ? `${boss.name} is defeated` : `${boss.name} escaped`}</h2>
      <p>
        Round <span className="num">{nf.format(Number(r))}</span> took <span className="num">{nf.format(total)}</span> of{" "}
        <span className="num">{nf.format(boss.hp)}</span> HP: <span className="num">{nf.format(settled.wheelDamage)}</span> from the wheel and{" "}
        <span className="num">{nf.format(players)}</span> from players.
      </p>
      {rows.length ? (
        <ol className="podium">
          {rows.slice(0, 3).map((x) => (
            <li key={x.attacker}><span className="mono">{short(x.attacker)}</span> <span className="num">{nf.format(x.damage)}</span></li>
          ))}
        </ol>
      ) : (
        <p className="fine">No player attacks were recorded this round.</p>
      )}
    </section>
  );
}

function HowTo() {
  return (
    <section className="panel" id="how" aria-labelledby="how-title">
      <h2 id="how-title">How to play</h2>
      <ol className="steps">
        <li><strong>The hamster fights for you.</strong> Squeekchain's real hamster runs a wheel. Every centimetre it runs is 1 damage to this round's Boss.</li>
        <li><strong>Connect and attack.</strong> Connect a wallet on Sepolia and press Attack. You sign a 0 ETH transaction that sends 0 SQK to the round's raid address, so it costs only test gas.</li>
        <li><strong>Hits and cooldown.</strong> A hit deals {HIT_BASE} to {HIT_BASE + HIT_SPREAD} damage, set by its transaction hash. Each wallet lands one counted hit every 25 Sepolia blocks, about {COOLDOWN_SECONDS / 60} minutes; extra hits are recorded but deal 0.</li>
        <li><strong>Settlement.</strong> When Squeekchain settles the round, the Boss is defeated if its HP reached 0, or it escapes. A new Boss with a new name and look spawns for the next round.</li>
      </ol>
      <p className="fine">
        Every player shares the round's wheel work and the attacks read from Sepolia. Wheel distance uses Squeekchain's round work at 878 mm per accepted passage. Final results wait for the round's work to settle on-chain.
      </p>
    </section>
  );
}

