#!/usr/bin/env node
/**
 * Capture TerraTwin screenshots of every major view at fixed viewports.
 *
 *   node scripts/shots.mjs --base http://localhost:5180 --out ../../docs/redesign/screenshots/before
 *   node scripts/shots.mjs --views mars-selected,compare --sizes 1440x900
 *   node scripts/shots.mjs --sizes 1440x790,1920x970      # realistic browser-window heights
 *
 * Requires a running dev server (it uses the dev-only `window.__terratwin` hook to drive state)
 * and the API on VITE_API_BASE_URL. Uses the locally installed Google Chrome via playwright-core.
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

const JEZERO = { lat: 17.67557431706733, lon: 77.01274064381283, siteId: "Jezero", label: "Jezero" };
const OFFSITE = { lat: -60, lon: 10, siteId: null, label: "60.00° S, 10.00° E" };

/** Each view: a function run in the page (receives the hook) + extra settle time. */
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
      s.set({ search: res, candidateId: `t1:${res.tier1.candidates[0].region_id}`, tier: 1 }); s.go("earth");
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
  compare: {
    run: async (h, p) => {
      const s = h.useApp.getState(); s.set({ introOpen: false }); s.select(p.jezero);
      const res = await h.api.findAnalogs({ lat: p.jezero.lat, lon: p.jezero.lon, footprint_km: 25, mission: "landing_site" });
      s.set({ search: res, candidateId: `t2:${res.tier2.candidates[0].id}`, tier: 2 }); s.go("compare");
    },
    settle: 9000,
  },
  "compare-why": {
    run: async (h, p) => {
      const s = h.useApp.getState(); s.set({ introOpen: false }); s.select(p.jezero);
      const res = await h.api.findAnalogs({ lat: p.jezero.lat, lon: p.jezero.lon, footprint_km: 25, mission: "landing_site" });
      s.set({ search: res, candidateId: `t2:${res.tier2.candidates[0].id}`, tier: 2 }); s.go("compare"); s.set({ whyOpen: true });
    },
    settle: 9000,
  },
  evidence: { run: async (h) => { h.useApp.getState().set({ introOpen: false }); h.useApp.getState().go("evidence"); }, settle: 4000, pages: 4 },
  report: {
    run: async (h, p) => {
      const s = h.useApp.getState(); s.set({ introOpen: false }); s.select(p.jezero);
      const res = await h.api.findAnalogs({ lat: p.jezero.lat, lon: p.jezero.lon, footprint_km: 25, mission: "landing_site" });
      s.set({ search: res, candidateId: `t2:${res.tier2.candidates[0].id}`, tier: 2 }); s.go("compare"); s.go("report");
    },
    settle: 3000,
    pages: 4,
  },
};

const names = ONLY ? ONLY.split(",") : Object.keys(VIEWS);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=metal", "--enable-unsafe-swiftshader"],
});
const failures = [];
for (const [w, h] of SIZES) {
  const mobile = w < 768;
  for (const name of names) {
    const view = VIEWS[name];
    if (!view) { console.error(`unknown view ${name}`); continue; }
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    try {
      await page.goto(BASE, { waitUntil: "load" });
      await page.waitForFunction(() => !!window.__terratwin, null, { timeout: 20000 });
      await page.waitForTimeout(2500); // globe boot
      await page.evaluate(async ({ src, p }) => {
        // eslint-disable-next-line no-new-func
        const fn = new Function("h", "p", `return (${src})(h, p)`);
        await fn(window.__terratwin, p);
      }, { src: view.run.toString(), p: { jezero: JEZERO, offsite: OFFSITE } });
      await page.waitForTimeout(view.settle ?? SETTLE);
      const file = resolve(OUT, `${w}x${h}-${name}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 82 });
      // Long pages scroll inside the stage: capture further screens of the first scrollable container.
      for (let k = 1; k < (view.pages ?? 1); k++) {
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
      }
      console.log(`✓ ${w}x${h} ${name}${errors.length ? `  (${errors.length} console errors)` : ""}`);
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
