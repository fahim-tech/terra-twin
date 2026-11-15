/**
 * Evidence view model: reads the /api/evidence payload into the shapes the page draws.
 * Every number on the page comes from here, and every reader returns null when the payload
 * does not carry the value — the page shows that as missing, never as a made-up figure.
 */
import { instrumentWords } from "../../lib/wording";

type Json = Record<string, unknown>;

const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const at = (o: unknown, ...path: string[]): unknown => path.reduce<unknown>((acc, k) => obj(acc)?.[k], o);

/** Plain names for the research method codes. Codes stay reachable as technical terms. */
export const METHOD_NAMES: Record<string, { name: string; short: string; note?: string }> = {
  M0_baseline: { name: "Direct comparison", short: "Direct", note: "no correction" },
  M1_qweights: { name: "Observed-fraction weighting", short: "Observed-fraction", note: "retired" },
  M3_debias_global: { name: "Constant bias correction", short: "Constant bias" },
  M3_debias_perEZ: { name: "Per-site bias correction", short: "Per-site bias" },
  M2_OOM: { name: "Observation-operator matching", short: "OOM", note: "deployed" },
};

/** Names for the observation chains used in the falsification experiment. */
export const CHAIN_NAMES: Record<string, string> = {
  baseline: "None (direct)",
  primary: "Linear + ½ px",
  nearest: "Nearest neighbour",
  cubic: "Cubic",
  no_halfshift: "Linear, no ½ px shift",
  random_mask: "Linear, random mask",
};

export interface MethodRow { code: string; name: string; note?: string; mrr: number; lo: number | null; hi: number | null; top1: number | null; n: number | null }
export interface ChainRow { chain: string; name: string; direct: number | null; deployed: number | null; matched: number | null; adverse: boolean; cells: Record<string, number | null> }
export interface InterpRow { label: string; interpolator: string; halfshift: boolean; error: number; rho: number | null; kappa: number | null; selected: boolean }
export interface SupportRow { site: string; fraction: number }
export interface StageInfo { letter: string; title: string; detail: string; raw: string }
export interface DatasetRow { id: string; title: string; planet: string; role: string; status: string; resolution: string | null; coverage: string | null; url: string | null; notes: string | null }

export interface EvidenceModel {
  method: { name: string | null; version: string | null; summary: string | null; operatorNote: string | null; stages: StageInfo[]; features: string[] };
  synthetic: { label: string | null; nTwins: number | null; status: string | null };
  key: {
    directTop1: number | null; oomTop1: number | null; directMrr: number | null; oomMrr: number | null;
    alt: { name: string; top1: number | null; mrr: number | null } | null;
    adverse: { chain: string; oom: number; direct: number } | null;
  };
  methods: MethodRow[];
  chains: ChainRow[];
  chainColumns: string[];
  falsificationHeadline: string | null;
  falsificationLabel: string | null;
  interp: { rows: InterpRow[]; label: string | null; marsRho: number | null; marsKappa: number | null };
  support: { rows: SupportRow[]; label: string | null; median: number | null; min: number | null; max: number | null };
  retiredNote: string | null;
  abstention: {
    synthetic: { total: number | null; named: number | null; abstained: number | null; accNamed: number | null; accAbstained: number | null; twinInTie: number | null; tieMedian: number | null; tieMax: number | null };
    real: {
      label: string | null;
      report: { named: number | null; ties: { size: number; count: number }[] };
      gated: { named: number | null; ties: { size: number; count: number }[]; pass: number | null; pool: number | null };
    };
  };
  controls: {
    positive: { control: string; target: string | null; ranks: { method: string; rank: number | null }[] }[];
    poolSize: number | null;
    negTop10Oom: number | null; negPairs: number | null; negNames: string[];
    gatePass: { name: string; pass: boolean }[];
    negativePassingGate: number | null;
  };
  coverage: { tier1Cells: number | null; tier1Km: number | null; tier1Source: string | null; tier2Windows: number | null; tier2Km: number | null; tier2Source: string | null; tier2Scope: string | null; marsTargets: number | null; marsScope: string | null };
  novelty: { wording: string | null; status: string | null; site: string | null };
  limitations: { code: string; text: string }[];
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function ties(sizes: unknown): { size: number; count: number }[] {
  const o = obj(sizes);
  if (!o) return [];
  return Object.entries(o)
    .map(([k, v]) => ({ size: Number(k), count: num(v) ?? 0 }))
    .filter((t) => Number.isFinite(t.size) && t.size >= 2 && t.count > 0)
    .sort((a, b) => a.size - b.size);
}

/** "S — sampling: MEGDR bins with ≥1 shot" → { letter: "S", title: "Sampling", detail: "MEGDR bins with ≥1 shot" } */
const STAGE_TITLES: Record<string, string> = { S: "Sampling", I: "Interpolation", B: "Half-pixel blend", W: "Warp" };

export function parseStage(raw: string): StageInfo {
  const m = raw.match(/^\s*([A-Z])\s*[—–-]\s*(.+)$/);
  if (!m) return { letter: "", title: raw, detail: "", raw };
  const [, letter, rest] = m;
  const named = rest.match(/^([^:]+?)\s*:\s*(.+)$/);
  if (named) return { letter, title: named[1].charAt(0).toUpperCase() + named[1].slice(1), detail: named[2], raw };
  return { letter, title: STAGE_TITLES[letter] ?? letter, detail: rest, raw };
}

export function buildModel(e: unknown, opts: { poolSize?: number | null } = {}): EvidenceModel {
  const sb = at(e, "synthetic_benchmark");
  const twin = obj(at(sb, "twin")) ?? {};
  const t = (code: string, k: string) => num(at(twin, code, k));

  const methods: MethodRow[] = arr(at(sb, "mrr_ci"))
    .map((r): MethodRow | null => {
      const code = str(at(r, "method")) ?? "?";
      const mrr = num(at(r, "MRR"));
      if (mrr === null) return null;
      const meta = METHOD_NAMES[code];
      return { code, name: meta?.name ?? code, note: meta?.note, mrr, lo: num(at(r, "ci_lo")), hi: num(at(r, "ci_hi")), top1: t(code, "top1"), n: num(at(r, "n_targets")) };
    })
    .filter((r): r is MethodRow => r !== null)
    .sort((a, b) => b.mrr - a.mrr);

  // The strongest alternative is computed, not assumed: the best non-OOM, non-retired method.
  const altRow = methods.filter((m) => m.code !== "M2_OOM" && m.code !== "M0_baseline" && m.code !== "M1_qweights")[0] ?? null;

  const misRows = arr(at(e, "falsification", "misspecification_mrr"));
  const chainColumns = misRows.length ? Object.keys(obj(misRows[0]) ?? {}).filter((k) => k !== "true_chain") : [];
  const chains: ChainRow[] = misRows.map((r) => {
    const chain = str(at(r, "true_chain")) ?? "?";
    const direct = num(at(r, "baseline"));
    const deployed = num(at(r, "primary"));
    const cells: Record<string, number | null> = {};
    for (const c of chainColumns) cells[c] = num(at(r, c));
    return { chain, name: CHAIN_NAMES[chain] ?? chain, direct, deployed, matched: num(at(r, chain)), adverse: direct !== null && deployed !== null && deployed < direct, cells };
  });
  const adverseRow = chains.filter((c) => c.adverse).sort((a, b) => (b.direct! - b.deployed!) - (a.direct! - a.deployed!))[0];

  const interpRows: InterpRow[] = arr(at(e, "interpolator_selection", "rows"))
    .map((r): InterpRow | null => {
      const err = num(at(r, "paired_abs_error"));
      if (err === null) return null;
      const interpolator = str(at(r, "interpolator")) ?? "?";
      const halfshift = at(r, "halfshift") === true;
      return { label: `${interpolator.charAt(0).toUpperCase()}${interpolator.slice(1)}${halfshift ? " + ½ px" : ""}`, interpolator, halfshift, error: err, rho: num(at(r, "rho_ns")), kappa: num(at(r, "kap_ew")), selected: false };
    })
    .filter((r): r is InterpRow => r !== null)
    .sort((a, b) => a.error - b.error);
  if (interpRows[0]) interpRows[0].selected = true;

  const supportRows: SupportRow[] = arr(at(e, "observation_support", "rows"))
    .map((r) => ({ site: str(at(r, "site")) ?? "?", fraction: num(at(r, "observed_fraction")) }))
    .filter((r): r is SupportRow => r.fraction !== null)
    .sort((a, b) => a.fraction - b.fraction);
  const fr = supportRows.map((r) => r.fraction);

  const ab = at(sb, "abstention");
  const nNamed = num(at(ab, "n_named"));
  const nAbst = num(at(ab, "n_abstained"));

  const cerb = obj(at(e, "controls", "summary", "cerberus")) ?? {};
  const posNames = [...new Set(Object.keys(cerb).map((k) => k.split("|")[0]))];
  const rows = arr(at(e, "controls", "rows"));
  const negNames = [...new Set(rows.filter((r) => String(at(r, "role")).startsWith("negative")).map((r) => String(at(r, "control"))))];
  const gatePassObj = obj(at(e, "real_mars", "gated", "named_controls_pass")) ?? {};
  const gatePass = Object.entries(gatePassObj).map(([name, v]) => ({ name, pass: v === true }));

  const chain = arr(at(e, "method", "chain")).map((c) => str(c)).filter((c): c is string => !!c);

  return {
    method: {
      name: str(at(e, "method", "name")), version: str(at(e, "method", "version")), summary: str(at(e, "method", "summary")),
      operatorNote: str(at(e, "method", "operator_note")), stages: chain.map(parseStage),
      features: arr(at(e, "method", "features")).map(String),
    },
    synthetic: { label: str(at(sb, "label")), nTwins: methods[0]?.n ?? null, status: str(at(sb, "validation_status")) },
    key: {
      directTop1: t("M0_baseline", "top1"), oomTop1: t("M2_OOM", "top1"),
      directMrr: t("M0_baseline", "MRR"), oomMrr: t("M2_OOM", "MRR"),
      alt: altRow ? { name: altRow.name, top1: altRow.top1, mrr: altRow.mrr } : null,
      adverse: adverseRow ? { chain: adverseRow.name, oom: adverseRow.deployed!, direct: adverseRow.direct! } : null,
    },
    methods,
    chains,
    chainColumns,
    falsificationHeadline: str(at(e, "falsification", "headline")),
    falsificationLabel: str(at(e, "falsification", "label")),
    interp: { rows: interpRows, label: str(at(e, "interpolator_selection", "label")), marsRho: num(at(e, "interpolator_selection", "mars_medians", "rho_ns")), marsKappa: num(at(e, "interpolator_selection", "mars_medians", "kap_ew")) },
    support: { rows: supportRows, label: str(at(e, "observation_support", "label")), median: median(fr), min: fr.length ? fr[0] : null, max: fr.length ? fr[fr.length - 1] : null },
    retiredNote: str(at(e, "retired", "q_weights")),
    abstention: {
      synthetic: {
        total: nNamed !== null && nAbst !== null ? nNamed + nAbst : null, named: nNamed, abstained: nAbst,
        accNamed: num(at(ab, "acc_named")), accAbstained: num(at(ab, "acc_abstained")),
        twinInTie: num(at(ab, "twin_in_tied_set_abstained")), tieMedian: num(at(ab, "tied_set_size_median_abstained")), tieMax: num(at(ab, "tied_set_size_max")),
      },
      real: {
        label: str(at(e, "real_mars", "label")),
        report: { named: num(at(e, "real_mars", "ungated", "named")), ties: ties(at(e, "real_mars", "ungated", "tied_sizes")) },
        gated: { named: num(at(e, "real_mars", "gated", "gated_named")), ties: ties(at(e, "real_mars", "gated", "gated_tied_sizes")), pass: num(at(e, "real_mars", "gated", "n_pass")), pool: num(at(e, "real_mars", "gated", "n_pool")) },
      },
    },
    controls: {
      positive: posNames.map((control) => ({
        control,
        target: str(at(rows.find((r) => String(at(r, "role")).startsWith("positive") && at(r, "control") === control), "target")),
        ranks: ["M0", "M3", "OOM"].map((m) => ({ method: m, rank: num(arr(cerb[`${control}|${m}`])[0]) })),
      })),
      poolSize: num(at(e, "real_mars", "gated", "n_pool")) ?? opts.poolSize ?? null,
      negTop10Oom: num(at(e, "controls", "summary", "neg_top10", "OOM")), negPairs: num(at(e, "controls", "summary", "n_neg_pairs")),
      negNames, gatePass,
      negativePassingGate: num(at(e, "real_mars", "gated", "negative_controls_pass")),
    },
    coverage: {
      tier1Cells: num(at(e, "coverage", "tier1", "n_cells")), tier1Km: num(at(e, "coverage", "tier1", "cell_km")), tier1Source: str(at(e, "coverage", "tier1", "source")),
      tier2Windows: num(at(e, "coverage", "tier2", "n_windows")), tier2Km: num(at(e, "coverage", "tier2", "window_km")), tier2Source: str(at(e, "coverage", "tier2", "source")), tier2Scope: str(at(e, "coverage", "tier2", "scope")),
      marsTargets: num(at(e, "coverage", "mars", "n_targets")), marsScope: str(at(e, "coverage", "mars", "scope")),
    },
    novelty: { wording: str(at(e, "novelty", "wording")), status: str(at(e, "novelty", "status")), site: str(at(e, "novelty", "site_novelty")) },
    limitations: arr(at(e, "limitations"))
      .map((l) => ({ code: str(at(l, "code")) ?? "", text: instrumentWords(str(at(l, "text"))) ?? "" }))
      .filter((l) => l.text),
  };
}

/**
 * The metre value written just before a noun in a payload sentence ("… about 31% of 463 m cells contain …"
 * with "cells" → "463"), or null when the sentence does not state it. Used to label drawings with the
 * payload's own figure for the thing drawn, never a default.
 */
export function metresBefore(text: string | null | undefined, noun: string): string | null {
  if (!text) return null;
  const esc = noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*m\\s+${esc}\\b`))?.[1] ?? null;
}

/** Fixed-precision formatters (spec §3): fractions as % 0 dp, MRR 3 dp in rows, 2 dp in headlines. */
export const fmtPct = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(d)}%`);
export const fmtNum = (v: number | null | undefined, d = 3) => (v === null || v === undefined ? "—" : v.toFixed(d));
export const fmtInt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("en-US"));

/**
 * ISO timestamp → "2026-11-15 00:40 UTC" (any offset converted to UTC). A date-time without an offset is
 * read as UTC, as the importer writes it, never as the viewer's local time (which would shift it by the
 * viewer's zone and still be labelled UTC). Unparseable input is shown as given; missing as "—".
 */
export function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const naive = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso.trim());
  const t = Date.parse(naive ? `${iso.trim().replace(" ", "T")}Z` : iso);
  if (Number.isNaN(t)) return iso;
  return `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Axis ticks for a [lo, hi] range at a "nice" step. */
export function niceTicks(lo: number, hi: number, target = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= target) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * Ticks for a zoomed axis: the nice ticks, plus each end of the axis when it falls clear of them, so a
 * reader sees where the zoomed axis starts and stops instead of assuming it starts at the first label.
 */
export function zoomedTicks(lo: number, hi: number, target = 5): number[] {
  const t = niceTicks(lo, hi, target);
  if (!(hi > lo)) return t;
  const clear = (hi - lo) * 0.08;
  if (t[0] - lo > clear) t.unshift(lo);
  if (hi - t[t.length - 1] > clear) t.push(hi);
  return t;
}
