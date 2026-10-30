import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { chain } from "./config";
import { WALLET_ICONS } from "./wallet-icons";
import { OPEN_IN, isMobileBrowser } from "./open-in";
import { short } from "./raid";

const markSrc = (id: string) =>
  WALLET_ICONS[id] ? `data:image/svg+xml;utf8,${encodeURIComponent(WALLET_ICONS[id]!)}` : undefined;

/** The connect control and its sheet: the site's own type and colors, the network's structure. */
export function ConnectSheet() {
  const mobile = isMobileBrowser();
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending, variables, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    reset();
    opener.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && sheet.current) {
        const items = [...sheet.current.querySelectorAll<HTMLElement>("button:not(:disabled), a")];
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { if (isConnected) setOpen(false); }, [isConnected]);

  // EIP-6963 names each installed extension; wagmi's generic injected row is only for a browser
  // where discovery found nothing, and then it is called what it is.
  const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const listed = [...connectors.filter((c) => c.type === "injected"), ...connectors.filter((c) => c.type !== "injected")]
    .filter((c) => !(c.id === "injected" && named));
  const label = (c: Connector) =>
    c.id === "injected" ? "Browser wallet" : c.id === "coinbaseWalletSDK" && mobile ? "Coinbase Smart Wallet" : c.name;
  const icon = (c: Connector) => c.icon ?? markSrc(c.id);

  if (isConnected && address && chainId !== chain.id) {
    return (
      <div className="connect">
        <button className="btn" onClick={() => switchChain({ chainId: chain.id })} disabled={switching}>
          {switching ? "Switching…" : `Switch to ${chain.name}`}
        </button>
        {switchError && <span className="note" role="status">Switch in your wallet, then try again.</span>}
      </div>
    );
  }
  if (isConnected && address)
    return (
      <button className="btn btn-quiet" onClick={() => disconnect()} title="Disconnect this wallet">
        <span className="mono">{short(address)}</span> · Disconnect
      </button>
    );
  return (
    <>
      <button ref={opener} className="btn" onClick={() => setOpen(true)} aria-haspopup="dialog">Connect</button>
      {open && (
        <div className="sheet-bg" onClick={close}>
          <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2 id="sheet-title">Connect a wallet</h2>
              <button className="x" aria-label="Close" onClick={close}>×</button>
            </div>
            {mobile && OPEN_IN.map((w) => (
              <a key={w.id} className="row" href={w.href(location.href)}>
                <span className="ic"><img width={28} height={28} src={markSrc(w.id)} alt="" /></span>
                <span>Open in {w.name}</span>
              </a>
            ))}
            {listed.filter((c) => !mobile || c.type !== "injected").map((c) => (
              <button key={c.uid} className="row" onClick={() => connect({ connector: c })} disabled={isPending}>
                <span className="ic">{icon(c) ? <img width={28} height={28} src={icon(c)} alt="" /> : null}</span>
                <span>{label(c)}{isPending && variables?.connector === c ? " · opening…" : ""}</span>
              </button>
            ))}
            {error && <p className="note" role="status">That wallet did not connect. Pick it again or try another.</p>}
          </div>
        </div>
      )}
    </>
  );
}
