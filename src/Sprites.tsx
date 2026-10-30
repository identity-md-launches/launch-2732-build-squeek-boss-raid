import type { ReactElement } from "react";
import type { Boss } from "./raid";

// 16 x 14 boss: o outline, b body, d shade, l belly, e eye, w tooth, n nose
const BOSS = [
  "..oo........oo..",
  ".obbo......obbo.",
  ".obdbo....obdbo.",
  "..obbboooobbbo..",
  "..obbbbbbbbbbo..",
  ".obbeebbbbeebbo.",
  ".obbeobbbbeobbo.",
  "obbbbbbnnbbbbbbo",
  "obbbbbwbbwbbbbbo",
  "obbdbbbbbbbbdbbo",
  ".obdblllllldbdo.",
  ".obbllllllllbbo.",
  "..obbllllllbbo..",
  "...oooooooooo...",
];
const CROWNS: string[][] = [
  [],
  ["....c..cc..c....", "....cccccccc...."],
  [".h............h.", "hh............hh"],
];

export function BossSprite({ boss, hurt }: { boss: Boss; hurt: boolean }) {
  const { body, dark, belly } = boss.palette;
  const colors: Record<string, string> = { o: "#2b1d14", b: body, d: dark, l: belly, e: boss.eye, w: "#fffaf0", n: "#f28da0", c: "#ffd23f", h: "#e9e2d4" };
  const top = CROWNS[boss.crown]!;
  const rows = [...top, ...BOSS];
  const rects: ReactElement[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colors[ch]} />);
    }),
  );
  return (
    <svg className={`boss-sprite${hurt ? " hurt" : ""}`} viewBox={`0 0 16 ${rows.length}`} shapeRendering="crispEdges" role="img" aria-label={`${boss.name}, a pixel-art boss`}>
      {rects}
    </svg>
  );
}

// 12 x 9 hamster: o outline, f fur, l cream, e eye, p pink
const HAMSTER = [
  "..oo....oo..",
  ".opfo..ofpo.",
  ".offfoooffo.",
  "offeffffeffo",
  "offffppffffo",
  "ofllllllllfo",
  "ofllllllllfo",
  ".offllllffo.",
  "..oo.oo.oo..",
];

export function HamsterWheel({ running }: { running: boolean }) {
  const colors: Record<string, string> = { o: "#2b1d14", f: "#e8913a", l: "#fff4e0", e: "#2b1d14", p: "#f28da0" };
  return (
    <svg className={`wheel${running ? " running" : ""}`} viewBox="0 0 32 32" shapeRendering="crispEdges" role="img" aria-label={running ? "The hamster is running" : "The wheel is resting"}>
      <g className="wheel-ring">
        <circle cx="16" cy="16" r="14" fill="none" stroke="#6b5545" strokeWidth="2" />
        {[0, 45, 90, 135].map((a) => (
          <rect key={a} x="15" y="3" width="2" height="26" fill="#6b5545" transform={`rotate(${a} 16 16)`} />
        ))}
      </g>
      <g transform="translate(10 28)">
        {HAMSTER.flatMap((row, y) =>
          [...row].map((ch, x) => (ch === "." ? null : <rect key={`${x}-${y}`} x={x} y={y - 9} width={1} height={1} fill={colors[ch]} />)),
        )}
      </g>
    </svg>
  );
}
