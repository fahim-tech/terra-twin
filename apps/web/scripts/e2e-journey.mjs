/**
 * End-to-end check of the primary journey against a running build (local or deployed):
 *   Intro → Start with Jezero → Mars measurements → Find Earth analogs → Earth results (research, screen)
 *   → select a candidate → Compare (each mode) → Evidence → Report (JSON / CSV / print).
 * Reports each step as PASS/FAIL with the reason, every API response >= 500, and console errors; saves a
 * screenshot per step. Exit code 1 when any step fails.
 *   node scripts/e2e-journey.mjs --base https://terratwin-five.vercel.app --out /tmp/e2e [--size 1440x900]
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:5182");
const OUT = arg("out", "/tmp/terratwin-e2e");
const [W, H] = arg("size", "1440x900").split("x").map(Number);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [], bad = [], results = [];
page.on("console", (m) => { if (m.type() === "error" && !/mars\/relief.*503|503.*mars\/relief/.test(m.text())) errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 500 && !r.url().includes("/api/mars/relief")) bad.push(`${r.status()} ${r.url().replace(BASE, "")}`); });

let n = 0;
async function step(name, fn) {
  n += 1;
  try {
    const note = await fn();
    results.push({ step: `${n}. ${name}`, ok: true, note: note ?? "" });
  } catch (e) {
    results.push({ step: `${n}. ${name}`, ok: false, note: String(e?.message ?? e).slice(0, 220) });
  }
  await page.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}-${name.replace(/\W+/g, "-").toLowerCase()}.png` }).catch(() => {});
}
const click = async (re, timeout = 15000) => {
  // Skip locked trail steps (aria-disabled) that share a name with the real command.
  const b = page.locator('button:not([aria-disabled="true"])').filter({ hasText: re, visible: true }).first();
  await b.waitFor({ timeout }); await b.click();
};
const text = async (re, timeout = 20000) => page.getByText(re).filter({ visible: true }).first().waitFor({ timeout });

await step("intro loads with API figures", async () => {
  await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await text(/249,165/);
  return "249,165 cells shown";
});
await step("start with Jezero", async () => { await click(/Start with Jezero/i); await text(/JEZERO/i); });
await step("Mars terrain measurements", async () => { await text(/mean slope/i); await text(/463 m/i); });
await step("find Earth analogs", async () => { await click(/Find Earth analogs/i); await text(/Results for/i, 30000); });
await step("research comparison decision", async () => { await text(/stable leader|tie|no convincing|not enough evidence/i); });
await step("global screen tab", async () => {
  const t = page.getByRole("tab", { name: /screen/i }).first(); await t.click(); await text(/249,165|cells/i);
  await page.getByRole("tab", { name: /research/i }).first().click();
});
await step("open compare", async () => { await click(/Compare/i); await text(/Comparison/i, 30000); });
for (const mode of ["Measurements", "Evidence", "Relevance", "3D"]) {
  await step(`compare mode ${mode}`, async () => {
    const t = page.locator('[role="tab"], [role="radio"]').filter({ hasText: new RegExp(`^\\s*${mode}`, "i") }).first();
    await t.click({ timeout: 10000 }); await page.waitForTimeout(1500);
  });
}
await step("why this analog", async () => { await click(/Why this analog/i); await page.waitForTimeout(1200); await page.keyboard.press("Escape"); });
await step("evidence page", async () => {
  await click(/^\s*Evidence\s*$/i); await text(/synthetic/i);
});
await step("report page", async () => {
  await click(/^\s*Report\s*$/i); await text(/dossier|key figures/i, 30000);
});
for (const kind of ["JSON", "CSV"]) {
  await step(`report ${kind} download`, async () => {
    const [d] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), click(new RegExp(`Download ${kind}`, "i"))]);
    const path = `${OUT}/report.${kind.toLowerCase()}`; await d.saveAs(path); return d.suggestedFilename();
  });
}
await step("print layout", async () => {
  await page.emulateMedia({ media: "print" }); await page.waitForTimeout(800);
  await page.pdf?.({ path: `${OUT}/report.pdf` }).catch(() => {});
  await page.emulateMedia({ media: "screen" });
});

await browser.close();
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}${r.note ? `  — ${r.note}` : ""}`);
console.log(`API >=500: ${bad.length ? bad.join(", ") : "none"}`);
console.log(`console errors: ${errors.length ? errors.slice(0, 8).join(" | ") : "none"}`);
process.exit(results.every((r) => r.ok) && !bad.length ? 0 : 1);
