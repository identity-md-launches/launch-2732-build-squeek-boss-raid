# Squeek Boss Raid design

## Overview

This is a compact community game: the current Boss, HP, live hamster readings and Attack occupy the first surface. The existing visual idea is a pixel-art hamster burrow, with cream surfaces, orange controls and dark brown outlines. This revision preserves that style and the established page structure.

`src/styles.css` is the token and layout source. `src/App.tsx` contains the game, boards, summary and instructions; `src/Sprites.tsx` draws the local SVG pixel art. No remote fonts or images are required.

## Colors

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#fff4e0` | Page background |
| `--panel` | `#fffaf0` | Arena, panels and quiet controls |
| `--ink` | `#2b1d14` | Text, outlines and focus ring |
| `--muted` | `#6b5545` | Secondary text and labels |
| `--fur` | `#e8913a` | Primary buttons and selected tab |
| `--fur-hover` | `#f2a75c` | Hovered primary control |
| `--fur-press` | `#f7bf85` | Pressed control |
| `--quiet-hover` | `#fbe7c6` | Hovered quiet controls and tabs |
| `--hp` | `#d93a3a` | Remaining HP fill |
| `--hp-track` | `#f3d9c8` | Empty HP track and table separators |
| `--good` | `#dff2e2` | Defeated summary background |
| `--bad` | `#fbe0dc` | Escaped summary background |
| `--me` | `#fde9c9` | Connected wallet's leaderboard row |

The sheet backdrop is `rgb(43 29 20 / 0.55)`. Boss palettes live in `src/raid.ts`; illustration colors are separate from interface status colors. Status also has words, including defeated/escaped, pending and unavailable. The final taste probe measured all resolved text pairs above its 4.5:1 normal / 3:1 large-text bar; this is not a claim about untested states or all accessibility requirements.

## Typography

`--font` is `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. `--mono` is `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` and is used for shortened wallet addresses. There are no bundled font files. Actual system font faces depend on the reader's platform.

The five source sizes are `--fs-sm: .875rem`, `--fs-body: 1rem`, `--fs-md: 1.25rem`, `--fs-lg: 1.75rem`, `--fs-xl: 2.5rem`. Body line height is 1.5; headings are 1.15. CSS requests weights 400, 700 and 800. Headings balance their wrapping, paragraphs use pretty wrapping, and numbers use tabular numerals. H1 tracking is -0.02em, changing to -0.03em at desktop; prose has natural tracking. Instructions are capped at 70ch and footer prose at 80ch.

H1 is 28px on phones and 40px at the desktop breakpoint. H2, Attack and regular stat values use 20px. Stat values use the existing 16px body token at widths up to 360px so unavailable readings fit. Fine print, table labels and addresses use 14px at the default root size.

## Layout

Spacing tokens are 4, 8, 12, 16, 24 and 32px (`--space-1` through `--space-6`). Header, main and footer share a 1080px maximum width with 16px inline padding. Main sections have 24px gaps; panel interiors use 16px padding and 12–16px gaps.

Below 900px, sections stack in document order. The stage puts the 120px Boss beside its HP. Wheel statistics use two columns. At 420px and below, the wheel uses a 48px column, 8px gaps and `minmax(0, 1fr)` tracks; labels wrap naturally. At 360px and below, stat values use 16px. These rules keep the explicit unavailable state within 320 and 390px viewports.

At 900px and above, main becomes two columns. The arena spans both columns, with the Boss on the left and wheel/Attack on the right; the sprite grows to 200px. Leaderboard and summary sit side by side. Instructions span the main width. Under 640px the wallet dialog becomes a bottom sheet with safe-area padding; otherwise it is centered and at most 420px wide.

The final export was checked at 320, 390 and 1440px. The Boss, Connect and Attack were visible on the first 390×844 screen. Screenshots and overflow assertions covered running and expired readings. Other widths, native zoom and physical devices are not claimed as tested.

## Elevation & Depth

This is a flat system. `--line` is a 3px solid `--ink` border for structural pixel outlines. There are no box shadows, gradients or nested decorative cards. The fixed wallet backdrop uses `z-index: 20`; the skip link uses 10.

## Shapes

`--radius: 0` keeps controls and panels square. SVG sprite rectangles and `shapeRendering="crispEdges"` supply pixel edges. HP is a 24px rectangular bar. Avoid rounding or smoothing these into a different illustration style.

## Components

| Pattern / source | Reuse and states |
| --- | --- |
| `.btn`, `.btn-quiet`, `.btn-attack` / `styles.css` | Orange primary and cream quiet buttons; 44px minimum height, 56px for Attack. Hover/pressed backgrounds, explicit disabled state and a 2px offset focus outline. |
| Arena / `App.tsx` | H1, Boss, HP, live readings, freshness message and Attack. HP has no numeric ARIA value until shared damage is known. Missing totals are pending; failed/expired live rates say unavailable while counted damage remains visible. |
| `BossSprite({ boss, hurt })` / `Sprites.tsx` | Deterministic Boss palette, eye and crown from `bossFor(round)`. A new damage total triggers a 300ms stepped shake. SVG has an accessible image name. |
| `HamsterWheel({ running })` / `Sprites.tsx` | The ring spins only when live telemetry is available and running. Fault/expiry stops the ring. |
| `Boards`, `Table` / `App.tsx` | This round / All time tabs; roving tab stop and Left/Right keys. Loading, retry, empty and ranked table states. Numbers align right; the wallet's own row has `--me`. |
| `Summary` / `App.tsx` | Pending while canonical wheel work or the initial event scan is unavailable. Certified results show defeated/escaped in text and color, damage split, and the top three attackers. |
| `ConnectSheet` / `ConnectSheet.tsx` | Wallet selection, pending/rejected connection feedback, connected address/Disconnect and chain switching. Escape/backdrop/close dismiss; Tab cycles within the sheet and Escape returns focus to Connect. Phone rows link to the wallet apps. |
| Instructions / `App.tsx` | Numbered steps and inline emphasis; game rules sit next to the actions or in How to play. |

Motion uses specific properties: background 120ms, press transform 80ms, HP width 600ms in steps, wheel spin 900ms in steps. The existing reduced-motion query disables the ring, shake and transitions. No `transition: all` is used.

## Do's and Don'ts

- Start additional game surfaces with `.panel` and existing space/type tokens; keep controls next to their explanation.
- Keep the current Boss and Attack above secondary content on phones. Recheck both long pending labels and unavailable rates when altering columns.
- Reuse `--ink` focus outlines and the existing button states. Status must remain understandable without color or animation.
- Keep shared game totals based on public round work and events. Browser storage is not a source of wheel damage.
- Keep illustration palette changes in `raid.ts`/`Sprites.tsx`, separate from interface text and status roles.

Review applied the pinned Better Interface guidance by [Jakub Krehel](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface) (MIT); the documentation method derives from [Paul Bakaus's Impeccable](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md) (Apache-2.0). Coverage and unperformed checks are recorded in `VALIDATION.md`.
