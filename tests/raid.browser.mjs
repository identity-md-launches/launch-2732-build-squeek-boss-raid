import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionResult, multicall3Abi, parseAbiItem } from "viem";
import { raidAddress } from "../src/raid.ts";
import { CORE_ROUND_ABI } from "../src/rounds.ts";

const { chromium, webkit } = await import(pathToFileURL(process.env.IMD_PLAYWRIGHT).href);
const reproduce = process.argv.includes("--reproduce");
const now = new Date("2026-10-30T16:00:00Z");
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const wallet1 = "0x1111111111111111111111111111111111111111";
const wallet2 = "0x2222222222222222222222222222222222222222";
const state = {
  round: 588n, distance: 1000, work: 1n, speed: 100, observedAt: now.toISOString(),
  genesis: BigInt(now.getTime() / 1000) - 587n * 600n - 60n,
  frontier: null, noCanonical: false,
  fail: false, head: 13000001n, logs: [],
};
const errors = [];
const root = resolve("dist");
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/preview\//, "");
    const file = resolve(root, path || "index.html");
    if (!file.startsWith(root + "/")) { res.writeHead(404).end(); return; }
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/preview/index.html`;
const browser = await (process.argv.includes("--webkit") ? webkit : chromium).launch({ headless: true });

function log(attacker, round, block, hash) {
  return {
    address: "0x1c0df748aa3814a13fb1294c7f1088ecc7b9973a",
    topics: encodeEventTopics({ abi: [transfer], eventName: "Transfer", args: { from: attacker, to: raidAddress(round) } }),
    data: encodeAbiParameters([{ type: "uint256" }], [0n]),
    blockNumber: `0x${block.toString(16)}`, transactionHash: `0x${hash.toString(16).padStart(64, "0")}`,
    blockHash: `0x${"a".repeat(64)}`, transactionIndex: "0x0", logIndex: "0x0", removed: false,
  };
}

async function pageAt(width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 600, hasTouch: width < 600,
    ...(width < 600 ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" } : {}) });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: now });
  await page.route("https://**/v1/**", async (route) => {
    if (state.fail) return route.fulfill({ status: 503, body: "Unavailable" });
    const path = new URL(route.request().url()).pathname;
    const response = path.endsWith("/status") ? {
      measurement: { coreStatus: "RUNNING", speedMmPerSecond: state.speed, distanceMm: state.distance, observedAt: state.observedAt, staleAfterSeconds: 120 },
      ...(!state.noCanonical ? { builder: { status: "available", anchor: { settledThroughRound: (state.round - 1n).toString() }, queued: { openRoundWorkUnits: state.work.toString() } } } : {}),
    } : path.endsWith("/core") ? {
      status: "available", identities: { core: "0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44" },
      configuration: { genesisTimestamp: state.genesis.toString(), roundDuration: "600" },
      core: { settledThroughRound: (state.frontier ?? state.round - 1n).toString() },
    } : { lifecycle: { currentRound: state.round.toString() } };
    await route.fulfill({ json: response });
  });
  await page.route(/https:\/\/(sepolia\.gateway\.tenderly\.co|ethereum-sepolia-rpc\.publicnode\.com)/, async (route) => {
    const handle = (request) => {
      let result;
      if (request.method === "eth_blockNumber") result = `0x${state.head.toString(16)}`;
      else if (request.method === "eth_getLogs") {
        const p = request.params[0];
        result = state.logs.filter((l) => BigInt(l.blockNumber) >= BigInt(p.fromBlock) && BigInt(l.blockNumber) <= BigInt(p.toBlock));
      } else if (request.method === "eth_call") {
        // roundPage: both checkpoint cumulative totals are public, regardless of visitor history.
        const pageResult = (data) => {
          const { args } = decodeFunctionData({ abi: CORE_ROUND_ABI, data });
          const round = args[1];
          return encodeFunctionResult({ abi: CORE_ROUND_ABI, functionName: "roundPage", result: {
            certifiedThroughRound: round,
            start: { cumulativeWork: 1000n, cumulativeBlockUnits: 0n, workPerThousandBlocks: 10000 },
            end: { cumulativeWork: round === 588n ? 1343n : 1000n, cumulativeBlockUnits: 0n, workPerThousandBlocks: 10000 }, rounds: [],
          } });
        };
        if (request.params[0].data.startsWith("0x82ad56cb")) {
          const { args } = decodeFunctionData({ abi: multicall3Abi, data: request.params[0].data });
          result = encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3",
            result: args[0].map((call) => ({ success: true, returnData: pageResult(call.callData) })) });
        } else result = pageResult(request.params[0].data);
      } else result = "0x1";
      return { jsonrpc: "2.0", id: request.id, result };
    };
    const body = route.request().postDataJSON();
    await route.fulfill({ json: Array.isArray(body) ? body.map(handle) : handle(body) });
  });
  await page.goto(url);
  await page.locator(".arena-head h1").filter({ hasNotText: "Summoning" }).waitFor();
  return { page, context };
}

const hp = (page) => page.locator(".hp-label .num").innerText();
const wheelDamage = (page) => page.locator(".stats dd").nth(2).innerText();
const close = async (...pages) => { for (const p of pages) await p.context.close(); };

try {
  const a = await pageAt();
  if (!reproduce) {
    await a.page.getByRole("button", { name: "Connect", exact: true }).click();
    await a.page.getByRole("dialog", { name: "Connect a wallet" }).waitFor();
    for (const wallet of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"]) {
      assert.equal(await a.page.getByRole("link", { name: `Open in ${wallet}`, exact: true }).count(), 1);
    }
    await a.page.keyboard.press("Escape");
    assert.equal(await a.page.getByRole("dialog").count(), 0);
    assert.equal(await a.page.getByRole("button", { name: "Connect", exact: true }).evaluate((el) => el === document.activeElement), true);
    assert.equal(await a.page.getByRole("button", { name: "Attack", exact: true }).isDisabled(), true);
  }
  state.distance = 301000; state.work = 343n;
  await a.page.clock.runFor(4100);
  const b = await pageAt();
  await b.page.locator(".hp-label .num").filter({ hasText: "/" }).waitFor();
  const shared = { a: { hp: await hp(a.page), wheel: await wheelDamage(a.page) }, b: { hp: await hp(b.page), wheel: await wheelDamage(b.page) } };
  console.log("shared-round", JSON.stringify(shared));
  if (reproduce) assert.notDeepEqual(shared.a, shared.b);
  else assert.deepEqual(shared.a, shared.b);
  state.round = 589n; state.work = 0n;
  state.observedAt = "2026-10-30T16:10:00Z";
  if (!reproduce) state.frontier = 587n;
  await a.page.clock.runFor(10500); await b.page.clock.runFor(10500);
  await a.page.locator(".summary").waitFor(); await b.page.locator(".summary").waitFor();
  if (!reproduce) {
    await a.page.getByRole("heading", { name: "Round 588 result pending", exact: true }).waitFor();
    await b.page.getByRole("heading", { name: "Round 588 result pending", exact: true }).waitFor();
    state.frontier = 588n;
    await a.page.clock.runFor(10500); await b.page.clock.runFor(10500);
    await a.page.locator(".summary.won").waitFor(); await b.page.locator(".summary.won").waitFor();
    state.frontier = null;
  }
  const summaries = { a: await a.page.locator(".summary").innerText(), b: await b.page.locator(".summary").innerText() };
  console.log("settlement", JSON.stringify(summaries));
  if (reproduce) assert.notEqual(summaries.a, summaries.b);
  else assert.equal(summaries.a, summaries.b);
  if (!reproduce) {
    assert.match(summaries.a, /Briefang is defeated/);
    assert.match(summaries.a, /30,115 from the wheel/);
    const joinedAfter = await pageAt();
    await joinedAfter.page.locator(".summary.won").waitFor();
    assert.equal(await joinedAfter.page.locator(".summary").innerText(), summaries.a);
    assert.equal(await wheelDamage(joinedAfter.page), "0");
    await close(joinedAfter);
  }
  await close(a, b);

  state.round = 5011n; state.work = 0n;
  state.genesis = BigInt(now.getTime() / 1000) - 5010n * 600n - 60n; state.observedAt = now.toISOString();
  state.logs = [log(wallet1, 1n, 12027600n, 500n), log(wallet2, 5011n, 13000000n, 501n)];
  const all = await pageAt();
  await all.page.getByRole("tab", { name: "All time", exact: true }).click();
  await all.page.locator(".board tbody tr").first().waitFor();
  const rows = await all.page.locator(".board tbody tr").allTextContents();
  console.log("all-time", JSON.stringify(rows));
  assert.equal(rows.length, reproduce ? 1 : 2);
  if (!reproduce) { assert.match(rows[0], /0x1111.*1,000/); assert.match(rows[1], /0x2222.*500/); }
  if (!reproduce) {
    await all.page.getByRole("tab", { name: "All time", exact: true }).focus();
    await all.page.keyboard.press("ArrowLeft");
    assert.equal(await all.page.getByRole("tab", { name: "This round", exact: true }).getAttribute("aria-selected"), "true");
    await all.page.keyboard.press("ArrowRight");
    assert.equal(await all.page.getByRole("tab", { name: "All time", exact: true }).getAttribute("aria-selected"), "true");
  }
  await close(all);

  state.round = 588n; state.work = 343n; state.speed = 1000; state.logs = [];
  state.genesis = BigInt(now.getTime() / 1000) - 587n * 600n - 60n;
  const stale = await pageAt();
  await stale.page.getByText("3.60 km/h", { exact: true }).waitFor();
  const before = await wheelDamage(stale.page);
  state.fail = true;
  await stale.page.clock.runFor(180000);
  const readings = await stale.page.locator(".stats dd").allTextContents();
  const running = await stale.page.locator(".wheel.running").count();
  console.log("expired-telemetry", JSON.stringify({ readings, running, message: await stale.page.locator(".arena > .fine").innerText() }));
  if (reproduce) { assert.equal(readings[0], "3.60 km/h"); assert.equal(running, 1); }
  else {
    assert.equal(readings[0], "Unavailable"); assert.equal(readings[1], "Unavailable"); assert.equal(running, 0);
    assert.equal(await wheelDamage(stale.page), before);
    await stale.page.getByText("Live wheel unavailable. Retrying.", { exact: true }).waitFor();
    await mkdir("test/scratch/regression", { recursive: true });
    for (const width of [320, 390]) {
      await stale.page.setViewportSize({ width, height: 844 });
      assert.equal(await stale.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `expired telemetry overflow at ${width}`);
    }
    await stale.page.screenshot({ path: "test/scratch/regression/expired-390.png", fullPage: true });
    state.fail = false; state.observedAt = "2026-10-30T16:03:00Z";
    await stale.page.clock.runFor(4100);
    await stale.page.getByText("3.60 km/h", { exact: true }).waitFor();
  }
  await close(stale);
  if (!reproduce) {
    state.observedAt = now.toISOString(); state.noCanonical = true;
    const missing = await pageAt();
    await missing.page.getByText("Awaiting wheel total", { exact: true }).waitFor();
    assert.equal(await wheelDamage(missing.page), "Pending");
    await close(missing);
    state.noCanonical = false;
    state.round = 588n; state.work = 100n; state.observedAt = now.toISOString();
    for (const width of [320, 390, 1440]) {
      const view = await pageAt(width);
      await view.page.getByText("3.60 km/h", { exact: true }).waitFor();
      await view.page.locator(".hp-label .num").filter({ hasText: "/" }).waitFor();
      assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 390) {
        assert.equal(await view.page.getByRole("button", { name: "Attack", exact: true }).evaluate((el) => el.getBoundingClientRect().bottom < innerHeight), true);
        await view.page.getByRole("button", { name: "Connect", exact: true }).click();
        await view.page.keyboard.press("Tab"); await view.page.keyboard.press("Shift+Tab");
        await view.page.screenshot({ path: "test/scratch/regression/wallet-390.png" });
        await view.page.keyboard.press("Escape");
      }
      await view.page.screenshot({ path: `test/scratch/regression/raid-${width}.png`, fullPage: width !== 390 });
      await close(view);
    }
    console.log("Connect/Escape/focus return, disabled Attack, tabs, and 320/390/1440 layouts passed.");
  }
  assert.deepEqual(errors, []);
  console.log(reproduce ? "All three reported defects reproduced." : "All three browser regressions passed.");
} finally {
  await browser.close(); await new Promise((done) => server.close(done));
}
