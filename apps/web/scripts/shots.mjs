#!/usr/bin/env node
/**
 * Capture TerraTwin screenshots of every major view at fixed viewports.
 *
 *   node scripts/shots.mjs --base http://localhost:5180 --out ../../docs/redesign/screenshots/before
 *   node scripts/shots.mjs --views mars-selected,compare --sizes 1440x900
 *   node scripts/shots.mjs --sizes 1440x790,1920x970      # realistic browser-window heights
 *
 * Flags: --base (dev server), --out (folder), --sizes (WxH list), --views (names below), --chrome (binary),
 * --settle (default per-view settle, ms).
 *
 * Requires a running dev server (it uses the dev-only `window.__terratwin` hook to drive state)
 * and the API on VITE_API_BASE_URL. Uses the locally installed Google Chrome via playwright-core.
 *
 * Waits are condition-based and bounded: the page waits for both globes to report ready (store/globes.ts),
 * the web fonts and a quiet network (imagery tiles, again before each capture), long pages are captured
 * screen by screen to the end, the report waits for its location plates to finish rendering, and
 * "compare-relief" opens the comparison's 3D relief mode.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:5180");
const OUT = resolve(process.cwd(), arg("out", "../../docs/redesign/screenshots/current"));
const SIZES = arg("sizes", "1440x900,1920x1080,390x844").split(",").map((s) => s.split("x").map(Number));
const ONLY = arg("views", "");
const CHROME = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const SETTLE = Number(arg("settle", "6500"));

/** Upper bounds for the condition waits (ms). */
const BOOT_TIMEOUT = 30_000;
/** After both globes are ready, and again before each capture: imagery tiles still arriving. */
const QUIET_MS = 700; // network quiet this long counts as settled …
const QUIET_TIMEOUT = 8_000; // … waiting at most this long (a spinning globe may keep fetching)
const PLATES_TIMEOUT = 30_000;
/** Long pages: capture screens until the end of the scroll container, at most this many. */
const MAX_PAGES = 40;

const JEZERO = { lat: 17.67557431706733, lon: 77.01274064381283, siteId: "Jezero", label: "Jezero" };
const OFFSITE = { lat: -60, lon: 10, siteId: null, label: "60.00° S, 10.00° E" };

/** Opens the comparison for Jezero's first research candidate (shared by compare views). */
const openCompare = async (h, p) => {
  const s = h.useApp.getState(); s.set({ introOpen: false }); s.select(p.jezero);
  const res = await h.api.findAnalogs({ lat: p.jezero.lat, lon: p.jezero.lon, footprint_km: 25, mission: "landing_site" });
  s.set({ search: res, candidateId: `t2:${res.tier2.candidates[0].id}`, tier: 2 }); s.go("compare");
};

/**
 * Each view: `run` (in the page, receives the hook), optional `after` (Playwright page step; return false
 * to skip the capture), extra `settle`, and `pages` ("all" = every screen of the scrolling stage).
 */
const VIEWS = {
  intro: { run: async () => {}, settle: 2000 },
  "mars-empty": { run: async (h) => { h.useApp.getState().set({ introOpen: false }); }, settle: 3000 },
  "mars-selected": {
    run: async (h, p) => { const s = h.useApp.getState(); s.set({ introOpen: false }); s.select(p.jezero); },
  },
  "mars-unavailable": {
    run: async (h, p) => { const s = h.useApp.getState(); s.set({ introOpen: false }); s.select(p.offsite); },
  },
  "earth-results": {
    run: async (h, p) => {
      const s = h.useApp.getState(); s.set({ introOpen: false }); s.select(p.jezero);
      const res = await h.api.findAnalogs({ lat: p.jezero.lat, lon: p.jezero.lon, footprint_km: 25, mission: "landing_site" });
      const first = res.tier2.candidates[0] ? `t2:${res.tier2.candidates[0].id}` : null;
      s.set({ search: res, candidateId: first, tier: 2 }); s.go("earth");
    },
  },
  "earth-tier1": {
    run: async (h, p) => {
      const s = h.useApp.getState(); s.set({ introOpen: false }); s.select(p.jezero);
      const res = await h.api.findAnalogs({ lat: p.jezero.lat, lon: p.jezero.lon, footprint_km: 25, mission: "landing_site" });
      s.set({ search: res, candidateId: null, tier: 1 }); s.go("earth"); // a cell is only selected by the user
    },
  },
  "earth-unavailable": {
    run: async (h, p) => {
      const s = h.useApp.getState(); s.set({ introOpen: false }); s.select(p.offsite);
      const res = await h.api.findAnalogs({ lat: p.offsite.lat, lon: p.offsite.lon, footprint_km: 25, mission: "landing_site" });
      s.set({ search: res, candidateId: null, tier: 2 }); s.go("earth");
    },
  },
  "earth-tied": {
    run: async (h, p) => {
      const s = h.useApp.getState(); s.set({ introOpen: false, mission: "terrain_geometry_only" }); s.select(p.jezero);
      const res = await h.api.findAnalogs({ lat: p.jezero.lat, lon: p.jezero.lon, footprint_km: 25, mission: "terrain_geometry_only" });
      s.set({ search: res, candidateId: null, tier: 2 }); s.go("earth");
    },
  },
  compare: { run: openCompare, settle: 9000 },
  "compare-why": {
    run: async (h, p) => {
      const s = h.useApp.getState(); s.set({ introOpen: false }); s.select(p.jezero);
      const res = await h.api.findAnalogs({ lat: p.jezero.lat, lon: p.jezero.lon, footprint_km: 25, mission: "landing_site" });
      s.set({ search: res, candidateId: `t2:${res.tier2.candidates[0].id}`, tier: 2 }); s.go("compare"); s.set({ whyOpen: true });
    },
    settle: 9000,
  },
  "compare-relief": {
    run: openCompare,
    settle: 6000,
    // The comparison's mode switch offers "3D relief" only when a relief viewer is wired (modes.ts).
    after: async (page) => {
      const mode = page.locator('[role="tab"], [role="radio"]').filter({ hasText: /^\s*3D relief\s*$/i }).first();
      if (!(await mode.count())) {
        console.log('  note: no "3D relief" mode in this build — compare-relief skipped');
        return false;
      }
      await mode.click();
      // Bounded: the relief section appears and its grid finishes loading (or says why it cannot).
      await page.waitForFunction(() => {
        const s = document.querySelector('section[aria-label^="Terrain relief"]');
        return !!s && !s.querySelector('[role="status"]');
      }, null, { timeout: 20_000 }).catch(() => console.log("  note: relief still loading after 20 s — captured as is"));
      await page.waitForTimeout(1500);
      return true;
    },
  },
  evidence: { run: async (h) => { h.useApp.getState().set({ introOpen: false }); h.useApp.getState().go("evidence"); }, settle: 4000, pages: "all" },
  report: {
    run: async (h, p) => {
      const s = h.useApp.getState(); s.set({ introOpen: false }); s.select(p.jezero);
      const res = await h.api.findAnalogs({ lat: p.jezero.lat, lon: p.jezero.lon, footprint_km: 25, mission: "landing_site" });
      s.set({ search: res, candidateId: `t2:${res.tier2.candidates[0].id}`, tier: 2 }); s.go("compare"); s.go("report");
    },
    settle: 1500,
    // The plates and their whole-disk locators render globe snapshots (camera flight, then capture); wait
    // until none is still rendering and every plate image has loaded.
    after: async (page) => {
      const ok = await page.waitForFunction(() => {
        const plates = document.querySelector("#dossier-plates");
        if (!plates) return false;
        const figures = [...plates.querySelectorAll("figure")];
        // A plate says "Rendering … imagery" (role=status); a disk locator says "Rendering the … whole disk".
        if (plates.querySelector('figure [role="status"]') || figures.some((f) => /\bRendering\b/.test(f.textContent ?? ""))) return false;
        const imgs = [...plates.querySelectorAll("figure img")];
        return imgs.every((i) => i.complete && i.naturalWidth > 0);
      }, null, { timeout: PLATES_TIMEOUT }).then(() => true, () => false);
      if (!ok) console.log(`  note: report plates not finished after ${PLATES_TIMEOUT / 1000} s — captured as is`);
      await page.waitForTimeout(700); // plate reveal fade
      return true;
    },
    pages: "all",
  },
};

/** Counts the page's requests in flight (every frame, so the globe iframes' tile requests too). */
function trackNetwork(page) {
  let inflight = 0;
  let last = Date.now();
  const start = () => { inflight++; last = Date.now(); };
  const end = () => { inflight = Math.max(0, inflight - 1); last = Date.now(); };
  page.on("request", start);
  page.on("requestfinished", end);
  page.on("requestfailed", end);
  /** Resolves once no request has been in flight for QUIET_MS, or after QUIET_TIMEOUT. */
  return async function quiet() {
    const t0 = Date.now();
    while (Date.now() - t0 < QUIET_TIMEOUT) {
      if (inflight === 0 && Date.now() - last >= QUIET_MS) return;
      await page.waitForTimeout(100);
    }
  };
}

/** Waits for both globes to report ready (bounded), the web fonts, then for the first tiles to arrive (bounded). */
async function waitForBoot(page, quiet) {
  const ready = await page.waitForFunction(() => {
    const r = window.__terratwin?.useGlobes?.getState().ready;
    return !!r && r.mars && r.earth;
  }, null, { timeout: BOOT_TIMEOUT }).then(() => true, () => false);
  if (!ready) console.log(`  note: globes not ready after ${BOOT_TIMEOUT / 1000} s — continuing`);
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await quiet();
}

const names = ONLY ? ONLY.split(",") : Object.keys(VIEWS);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=metal", "--enable-unsafe-swiftshader"],
});
const failures = [];
for (const [w, h] of SIZES) {
  // Phones in either orientation (a landscape phone is under 500 px tall) get touch and a phone user agent.
  const mobile = w < 768 || h < 500;
  for (const name of names) {
    const view = VIEWS[name];
    if (!view) { console.error(`unknown view ${name}`); continue; }
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    const quiet = trackNetwork(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    try {
      await page.goto(BASE, { waitUntil: "load" });
      await page.waitForFunction(() => !!window.__terratwin, null, { timeout: 20000 });
      await waitForBoot(page, quiet);
      await page.evaluate(async ({ src, p }) => {
        // eslint-disable-next-line no-new-func
        const fn = new Function("h", "p", `return (${src})(h, p)`);
        await fn(window.__terratwin, p);
      }, { src: view.run.toString(), p: { jezero: JEZERO, offsite: OFFSITE } });
      await page.waitForTimeout(view.settle ?? SETTLE);
      if (view.after && (await view.after(page)) === false) { await ctx.close(); continue; }
      await quiet(); // tiles requested by the last camera move
      const file = resolve(OUT, `${w}x${h}-${name}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 82 });
      // Long pages scroll inside the stage: capture further screens of the first scrollable container.
      const pages = view.pages === "all" ? MAX_PAGES : (view.pages ?? 1);
      let shot = 1;
      for (let k = 1; k < pages; k++) {
        const moved = await page.evaluate((k) => {
          const el = [...document.querySelectorAll("main *")].find((e) => {
            const cs = getComputedStyle(e);
            return (cs.overflowY === "auto" || cs.overflowY === "scroll") && e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300;
          });
          if (!el) return false;
          const before = el.scrollTop;
          el.scrollTop = k * el.clientHeight * 0.9;
          return el.scrollTop !== before;
        }, k);
        if (!moved) break;
        await page.waitForTimeout(900);
        await page.screenshot({ path: resolve(OUT, `${w}x${h}-${name}-p${k + 1}.jpg`), type: "jpeg", quality: 82 });
        shot = k + 1;
      }
      console.log(`✓ ${w}x${h} ${name}${shot > 1 ? ` (${shot} screens)` : ""}${errors.length ? `  (${errors.length} console errors)` : ""}`);
      if (errors.length) failures.push({ view: `${w}x${h} ${name}`, errors: errors.slice(0, 3) });
    } catch (e) {
      console.error(`✗ ${w}x${h} ${name}: ${e.message}`);
      failures.push({ view: `${w}x${h} ${name}`, errors: [e.message] });
    }
    await ctx.close();
  }
}
await browser.close();
if (failures.length) {
  console.log("\nConsole errors / failures:");
  for (const f of failures) console.log(`- ${f.view}: ${f.errors.join(" | ").slice(0, 300)}`);
}
console.log(`\nSaved to ${OUT}`);
