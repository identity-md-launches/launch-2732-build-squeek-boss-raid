# Squeek Boss Raid

A static React game for Squeekchain on Sepolia. The hamster's wheel deals shared round damage; players add on-chain hits with a wallet. This revision fixes shared wheel totals, historical attack indexing, and stale telemetry while preserving the existing game and wallet protocol.

## Install, build and preview

Use Node 22 or newer and npm. Dependencies are pinned by `package-lock.json`.

```sh
npm ci
npm run typecheck
npm run build
npm run preview
```

Open the local URL printed by Vite. `npm run dev` serves the source during development. The deliverable is the complete `dist/` directory, including its local favicon and share image. Vite uses `base: './'`; the app uses hash links and works under a static hosting subpath. Rebuild after changing source. No backend, secret, account or environment file is required to build or view it.

## Playing

Connect a wallet, switch to Sepolia (11155111), and press **Attack**. The existing attack sends `transfer(raidAddress(round), 0)` to the SQK token configured in `src/config.ts`: 0 ETH and 0 SQK, with Sepolia ETH needed for gas. A counted hit deals 500–1,000 damage. A wallet waits 25 blocks between counted hits; extra transactions are recorded but deal zero. Browser extensions use EIP-6963; phones can open the page in their wallet, and Coinbase Smart Wallet is available in the connection sheet.

The leaderboard reads token Transfer events from the configured launch block, in 20,000-block pages. All time aggregates every recognized round since that block; the table displays the top 20. Boss name, appearance and initial HP are deterministic from the Squeekchain round number.

## Shared wheel damage

The [Squeekchain API reference](https://docs.squeekchain.com/developers/api/) defines `/v1/status`'s `measurement.distanceMm` as a **daily** counter, not a round counter. Subtracting a visitor's first reading cannot recover a shared round baseline.

The game instead reads the canonical open-round total, `builder.queued.openRoundWorkUnits`, from the same public status endpoint. `/v1/core` supplies the round genesis, duration, core address and settled frontier. The status snapshot's `generatedAt` identifies its open round; older responses without it use the observation time. A mismatched or unavailable round total stays pending rather than becoming zero. No wheel totals are read from or written to browser storage.

Wheel work converts to distance at 878 mm per accepted passage (`src/rounds.ts`). This calibration was inferred exactly from the public `/v1/measurement/stats?range=7d` response on 2026-10-30: 40,350,246 mm / 45,957 work units = 878 mm. The [measurement documentation](https://docs.squeekchain.com/system/measurement/) explains that distance uses the wheel's fixed circumference. Damage is `floor(roundDistanceMm / 10)`.

Final results read [SqueekCore's published `roundPage`](https://docs.squeekchain.com/developers/core/#roundpage) with `(round - 1, round, 1)`. The difference between its ending and starting cumulative work is the complete round work, including certified zero-work rounds. The same distance conversion applies to current HP and summaries. The previous round's summary also loads for someone joining later. Until certification and the initial attack scan complete, the result stays pending. API and chain snapshots can lag at a boundary; new-round work is never assigned to an older Boss.

Status polls every 4 seconds; economy/core poll every 10 seconds; events poll every 12 seconds. Sample freshness is re-evaluated every second against `observedAt` and `staleAfterSeconds`. Failed or expired live reads stop the animation, show unavailable rates and a retry message, and retain the last known round damage. A fresh sample restores the live readings.

## Validation

The final source passed `npm run typecheck`, `npm run build`, and all **11 unit tests** with `npm test`. Chromium interaction tests against the production export passed: shared HP in independent contexts, identical certified summaries including a late join, pending results before certification, both historical and current leaderboard entries, expiry during HTTP 503 failures, preserved damage and recovery, missing canonical data, wallet sheet controls, keyboard tabs, and layouts at 320/390/1440. The 390 first screen contains the Boss and Attack. The pinned design probe passed **16/16** checks.

Run browser regressions with a supplied Playwright module and Chromium runtime:

```sh
IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright \
npm run test:browser
```

The test owns its preview server and browser in one foreground process and uses controlled API/RPC fixtures; it never signs or sends a transaction. Its screenshots go under ignored `test/scratch/regression/`. The design probe was run against live public reads, with screenshots under `test/scratch/taste/`. Scratch evidence is disposable and can be regenerated; it is not a runtime dependency.

WebKit could not launch because its provided executable was absent. The browser connector returned `Transport closed`, so rendered checks used the working Playwright Chromium runtime directly. Physical wallets, native Safari, screen readers and live transaction signing were not tested. Vite reports an existing `node:worker_threads` externalization warning from `ox`; the production export built and Chromium reported no script errors. See [VALIDATION.md](./VALIDATION.md) for findings, review coverage and limitations, and [DESIGN.md](./DESIGN.md) for the implemented design system.
