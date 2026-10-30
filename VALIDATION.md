# Revision validation — 2026-10-30

Scope: the three reopened findings in the existing static Squeek Boss Raid game. The existing React/Vite stack, game art, wallet connector, attack transaction and event protocol were retained. Changed surfaces are shared damage, historical event recognition, telemetry freshness and their loading/error states. The final export is `dist/`, served at `/preview/index.html` by the foreground browser test.

## Second revision: unavailable readings on narrow phones

Finding `fb84897dea3bc0908fffbcd19e39a56fe807287227497b9bf0171bd59cb5fc74` reproduced in Chromium in the expired-telemetry fixture (both API hosts 503, clock +180 s). `tests/raid.browser.mjs` now measures each stat's painted text with a `Range` against its own cell and against every other stat label/value at 320, 361, 375 and 390 wide. Against the previous export, the check failed with `Unavailable spills its cell` twice, while `scrollWidth` stayed within the viewport. Fix: `src/styles.css:119`. At ≤420px `.wheel-row` is now `grid-template-columns: minmax(0, 1fr)`, so the 48px wheel sits above full-width two-column stats. Gap, wheel size, stat tracks and type sizes are unchanged. After rebuilding, `npm run test:browser` exited 0 with no collisions at all four widths. At 390 Attack still ends inside the 844px first screen. The 320 live and 390 expired screenshots show separate labels and values. `npm test` passed 11/11 and the design probe passed 16/16. Playwright came from a locally available 1.64.1 install, not the path listed below. WebKit was again unavailable (`webkit-2370` executable missing), so the reported WebKit collision was not rechecked in WebKit.

## Reproduction and disposition

All three reports reproduced against the original production export in Chromium at 390×844, without connecting a wallet. The initial run of `tests/raid.browser.mjs --reproduce` recorded:

| Finding | Original observation | Final correction and recheck |
| --- | --- | --- |
| `44a8da68ab340bb373c57428958a2ad3939a547d924d9ae68d43b964f161f430` | At round 588 after daily distance changed from 1,000 to 301,000 mm, A showed HP 0/20,128 and 30,000 wheel damage; fresh B showed HP 20,128/20,128 and zero. A's summary said defeated; B's said escaped. | `src/hooks.ts:58`, `src/rounds.ts:21`, `src/App.tsx:21`: removed localStorage and visit-time deltas. Both contexts now read the same open-round work, convert it to distance, and show 30,115 damage and HP 0/20,128 for the 343-work fixture. Certified `roundPage` positions give the identical final total to both contexts and to a fresh late visitor. Summary remains pending before certification and while the initial attack scan is incomplete. |
| `fd390fd2e9a6102f8572fe5b7920cd5565a31263d9138626422ca55a6d99a2a3` | At round 5011, All time contained only the recent wallet (500); the round-1 wallet (1,000) was dropped. | `src/hooks.ts:103`: the address lookup starts at round 0, retains old entries, and extends as rounds advance. Paginated launch-to-head logs now yield both wallets, ranked 1,000 then 500. No moving round cutoff remains. |
| `d4ec4f382a7db7720426f01ede265fe7df8f2bc0b76e715cf1a0391531b7ff32` | After both API hosts returned 503 and the clock advanced 180 seconds, the 120-second sample still showed 3.60 km/h, 100 per s, a running wheel and no outage warning. | `src/hooks.ts:25`, `src/squeek.ts:64`, `src/App.tsx:81`: re-evaluate sample age every second; failures and expired samples make both rates unavailable, stop animation and display “Live wheel unavailable. Retrying.” The 30,115 previously counted damage remains. Fresh readings restore 3.60 km/h. |

The requested canonical daily-distance baseline is not present in `/status` or `/economy/state`: the public API documents `distanceMm` as the device's current-day counter. The fix therefore uses the API's canonical **per-round work** directly and SqueekCore's certified cumulative positions for completed rounds. This is a shared round baseline, rather than an estimate based on when a visitor arrived. The snapshot round is matched to the public genesis/duration; absent or mismatched totals stay unknown. No new backend or locally invented history was introduced.

Conversion evidence: the public `/v1/measurement/stats?range=7d` response returned `lifetime.acceptedWorkUnits = 45957` and `lifetime.observedDistanceMm = 40350246`, an exact 878 mm per work unit. This calibration is explicit in source and How to play. If the upstream installation changes its wheel calibration, that constant must be updated. See the primary [API](https://docs.squeekchain.com/developers/api/), [measurement](https://docs.squeekchain.com/system/measurement/) and [roundPage](https://docs.squeekchain.com/developers/core/#roundpage) documentation.

## Additional applicable finding

The new unavailable readings initially widened the phone arena. The saved 390px expiry screenshot showed the panel extending beyond the viewport. `src/styles.css:118` now uses the existing spacing tokens with a 48px wheel stacked above flexible stat tracks (see the second revision above), and the body type token at ≤360px. Rechecked with expiry-state overflow assertions at 320 and 390 and final screenshots. Running, pending and normal live layouts were also rechecked. No unrelated visual redesign was made.

## Commands and actual results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Exit 0, no TypeScript diagnostics. |
| `npm test` | Exit 0; 1 file, 11 tests passed. Covers canonical work, day resets, observation/snapshot round boundaries, missing totals, certified zero-work rounds, invalid work, expiry/recovery and historical scoring/cooldown. |
| `npm run build` | Exit 0; Vite production export created with relative assets. The inherited `ox` dependency emits a `node:worker_threads` externalization warning. No browser script error was observed. |
| `IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright npm run test:browser` | Exit 0 in Chromium against the export. Controlled public API and Sepolia RPC fixtures; range-correct logs and ABI-encoded direct/multicall reads. Shared HP, certified/pending/late-join summaries, historical rows, HTTP 503 expiry, damage retention/recovery, unknown canonical data, Connect/close/focus return, phone wallet links, keyboard tab arrows, disabled unsigned Attack, and overflow at 320/390/1440 passed. No transaction was sent. |
| `IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 0; **16/16 passed** on the production export with real public reads. Render, layout, targets, contrast, casing, tracking, eyebrows, type sizes/faces, glyphs, slogans, repetition, copy budget, chrome, motion and share metadata passed. |
| Browser connector navigation | Returned `Transport closed`; direct Playwright supplied the rendered checks and screenshots instead. |
| Browser regression with `--webkit` | Could not launch: supplied WebKit executable does not exist. No Safari pass is claimed. |

The probe measured no horizontal scrolling, overlapping text, covered text or hidden overflow at 320/390/1440. At 390 all six probed controls met the 24px/spacing bar and the 44px comfort size. Resolved text pairs met 4.5:1 (3:1 large). The live first screen had 40 prose words at 390 and 57 at 1440. The reduced-motion pass found no remaining endless animation. Local title/favicon/description/og:title/og:image were present and resolved.

## Better Interface review coverage

| Domain | Coverage | Evidence / remaining limits |
| --- | --- | --- |
| Accessibility | Checked for the changed surfaces | Native buttons/links, named HP progressbar without invented numeric values, polite error/summary regions, Connect/Escape/focus return, tab arrows and reduced-motion rules. Browser screenshots and probe checked layout/targets/contrast. Screen-reader sessions, native zoom, forced-colors and physical-device accessibility were not performed. |
| Layout | Checked | Final source keeps the existing grid/order; 320/390/1440 production layouts and the 390 first screen inspected. Running/expired rate labels and pending totals tested. Repaired the narrow expiry state. Other intermediate widths, RTL and native 200% zoom were not tested. |
| Writing | Checked | Removed the browser-local damage disclosure and replaced it with the actual shared-work rule. Added explicit pending settlement and unavailable live states; gas/cooldown directions remain beside Attack. No fabricated outcomes for absent canonical data. |
| Typography | Checked | Existing five-size token scale and 400/700/800 weights retained. Tabular numbers, wrapping and address typography inspected; narrow stat values reuse the 16px token. Probe reported four rendered sizes at 390/1440. No separate font files are loaded. |
| Colors | Checked for resolved states | Palette preserved; probe verified resolved text contrast. Defeated/escaped/pending/unavailable states have text cues. Native wallet prompts and vendor pages were not inspected. |
| UI | Checked | Existing square panels, buttons and pixel sprites preserved. Fresh, running, expired, restored, missing-total, board-empty/loaded and summary-pending/settled states exercised. Sheet keyboard closure and focus return checked. Real provider approval/signature and on-chain confirmation through a physical wallet were not performed. |

## Rendered evidence

Inspected screenshots in the disposable scratch area:

- `test/scratch/taste/shots/390.png`, `390-full.png`, `1440.png`, `1440-full.png`: actual live API/RPC export. Boss, Connect and Attack are on the first 390×844 screen.
- `test/scratch/regression/raid-320.png`, `raid-390.png`, `raid-1440.png`: controlled running game.
- `test/scratch/regression/expired-390.png`: unavailable rates, stopped wheel and retained total.
- `test/scratch/regression/wallet-390.png`: phone connection sheet.

Scratch files are excluded from submission and are not build inputs. Browser assertions independently verify the stated behaviors and regenerate the screenshots. These are worker checks, not independent certification.

The final packaging check found 33 submission-candidate files totaling less than 1 MiB, below the 8 MiB budget; `dist/` contains 753,983 bytes. All local HTML asset references resolved, metadata and the three response IDs validated, and no dependency archives, nested dependency directories or symlinks were included in that candidate. Existing ignore rules were left unchanged.

## Completion and limits

Complete for the stated revision scope: all three findings reproduced and fixed, the static export rebuilt, source/lockfile/documentation included, and findings answered in `.imd-responses.json`. Browser interaction validation uses deterministic fixtures; the design probe additionally used the actual public services. Public services and the development deployment can change. Real wallet signing, native Safari, physical devices and screen-reader testing remain unperformed. No hosting or publishing action was part of this revision.
