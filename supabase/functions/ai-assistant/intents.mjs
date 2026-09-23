// ============================================================================
// intents.mjs — النوايا الإحدى عشرة (نقيّة، بلا شبكة). كلٌّ يُرجع أرقاماً موصوفة، لا صياغة.
//   الخلفية تتحقّق من المعامل قبل الاستدعاء (index.ts)؛ هنا الحساب فقط عبر sales_compute (تكافؤه مع الشاشة مُختبَر بـG-AI-PARITY).
//   الحدّ الأدنى للحكم بالمعدّل اليوميّ (راكد/تغطية/نفاد) = 14 يوماً — قبله «التاريخ غير كافٍ».
// ============================================================================
import { computeScope, cleanMovements, salesRange, bizTs, agg, locName } from "./sales_compute.mjs";

export const RATE_MIN_DAYS = 14;                 // = S4_STAGNANT_MIN_DAYS في الشاشة
const round = n => Math.round(Number(n) || 0);
const normText = s => String(s == null ? "" : s).toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[ىي]/g, "ي").replace(/[ً-ْ\s]+/g, " ").trim();

// أسماء النوايا الإحدى عشرة (allowlist) — index.ts يرفض ما عداها
export const INTENT_KEYS = [
  "sales_summary", "top_sellers", "bottom_sellers", "product_movement",
  "period_comparison", "location_comparison", "stagnant_inventory",
  "stockout_risk", "inventory_value", "data_freshness", "biggest_decliners"
];

// وصف عربيّ لكل نيّة — يُعرض حين يسأل المستخدم عمّا لا نغطّيه
export const INTENT_AR = {
  sales_summary: "المبيعات المقدّرة", top_sellers: "الأكثر مبيعاً", bottom_sellers: "الأقلّ مبيعاً",
  product_movement: "حركة صنف معيّن", period_comparison: "مقارنة الفترات", location_comparison: "مقارنة المواقع",
  stagnant_inventory: "المخزون الراكد", stockout_risk: "مخاطر النفاد", inventory_value: "قيمة المخزون",
  data_freshness: "حداثة البيانات", biggest_decliners: "الأصناف الأكثر انخفاضاً"
};

// مطابقة المنتج: جزئية (تحتوي) على الاسم ＋ الكود ＋ الباركود عبر لقطة المخزون. أكثر من صنف ⇒ قائمة للتأكيد.
export function matchProducts(stock, phrase) {
  const q = normText(phrase); if (!q) return [];
  const bySku = new Map();
  for (const r of stock || []) {
    const hay = normText([r.name, r.sku, r.barcode].filter(Boolean).join(" "));
    if (hay.includes(q)) {
      const k = String(r.sku);
      if (!bySku.has(k)) bySku.set(k, { sku: k, name: r.name || "", barcode: r.barcode || "" });
    }
  }
  return [...bySku.values()].slice(0, 25);
}

// ————— النوايا —————

function sales_summary(ctx) {
  const r = computeScope({ ...ctx.data, period: ctx.params.period, location: ctx.params.location, nowMs: ctx.nowMs });
  if (r.salesShown.length && !r.uploadedInPeriod.length) return { kind: "no_upload", locations: r.missingLocs.map(d => d.name) };
  return {
    kind: "sales_summary", period: ctx.params.period, location: ctx.params.location,
    estimated_sales_incl: round(r.scope.val), estimated_sales_excl: round(r.scope.valExcl),
    units: round(r.scope.units), moved_products: r.movedNow,
    observed_days: Math.round(r.observedDays * 10) / 10,
    branches_included: r.dataActive.map(d => d.name),
    branches_missing_upload: r.missingLocs.map(d => d.name),
    note: "المبيعات مقدّرة (من نقص الكمية) لا مؤكّدة · المستودع مستبعَد (مخزن لا نقطة بيع)"
  };
}

function _sellers(ctx, dir) {
  const limit = ctx.params.limit || 20;
  const { movs } = cleanMovements(ctx.data.movements, ctx.data.uploads);
  const { since, prevSince } = salesRange(ctx.params.period, ctx.nowMs);
  const branchLocs = ctx.data.branches.map(b => b.id);
  const shown = ctx.params.location === "all" ? branchLocs : [ctx.params.location];
  const r = computeScope({ ...ctx.data, period: ctx.params.period, location: ctx.params.location, nowMs: ctx.nowMs });
  const up = new Set(r.uploadedInPeriod);
  const rows = movs.filter(m => m.kind === "estimated_sale" && bizTs(m.captured_at) >= since && shown.includes(m.location) && up.has(m.location));
  const bySku = new Map();
  for (const m of rows) {
    const k = String(m.sku), e = bySku.get(k) || { sku: k, name: m.sku_name || "", value: 0, units: 0 };
    e.units += Math.abs(Number(m.delta) || 0); if (m.value_est != null) e.value += Number(m.value_est) || 0;
    bySku.set(k, e);
  }
  let arr = [...bySku.values()].map(e => ({ ...e, value: round(e.value), units: round(e.units) }));
  arr.sort((a, b) => dir === "top" ? b.value - a.value : a.value - b.value);
  return {
    kind: dir === "top" ? "top_sellers" : "bottom_sellers", period: ctx.params.period, location: ctx.params.location,
    items: arr.slice(0, limit), count: arr.length, sort_basis: "إجمالي قيمة المبيعات المقدّرة (شامل)",
    note: "المبيعات مقدّرة · المستودع مستبعَد"
  };
}
const top_sellers = ctx => _sellers(ctx, "top");
const bottom_sellers = ctx => _sellers(ctx, "bottom");

function product_movement(ctx) {
  const matches = matchProducts(ctx.data.stock, ctx.params.product);
  if (!matches.length) return { kind: "product_not_found", phrase: ctx.params.product };
  if (matches.length > 1) return { kind: "disambiguate", phrase: ctx.params.product, candidates: matches };
  const sku = matches[0].sku;
  const { movs } = cleanMovements(ctx.data.movements, ctx.data.uploads);
  const { since } = salesRange(ctx.params.period, ctx.nowMs);
  const branchLocs = ctx.data.branches.map(b => b.id);
  const rows = movs.filter(m => String(m.sku) === sku && m.kind === "estimated_sale" && bizTs(m.captured_at) >= since && branchLocs.includes(m.location));
  const bm = new Map(ctx.data.branches.map(b => [b.id, b.name]));
  const byLoc = new Map();
  for (const m of rows) { const e = byLoc.get(m.location) || { location: bm.get(m.location) || m.location, units: 0, value: 0 }; e.units += Math.abs(Number(m.delta) || 0); if (m.value_est != null) e.value += Number(m.value_est) || 0; byLoc.set(m.location, e); }
  const per = [...byLoc.values()].map(e => ({ ...e, units: round(e.units), value: round(e.value) })).sort((a, b) => b.units - a.units);
  return {
    kind: "product_movement", period: ctx.params.period, product: matches[0].name, sku,
    total_units: per.reduce((s, e) => s + e.units, 0), total_value_incl: per.reduce((s, e) => s + e.value, 0),
    per_location: per, top_location: per[0] ? per[0].location : null,
    note: "المبيعات مقدّرة · الفروع فقط (المستودع سحب لا بيع)"
  };
}

function period_comparison(ctx) {
  if (ctx.params.period === "all") return { kind: "need_period", why: "المقارنة تحتاج فترة محدّدة (لا «كل التاريخ»)" };
  const r = computeScope({ ...ctx.data, period: ctx.params.period, location: ctx.params.location, nowMs: ctx.nowMs });
  if (r.prevBaselineOnly) return { kind: "baseline_only", why: "الفترة السابقة رفعة تأسيس فقط — لا مقارنة" };
  const cr = r.observedDays > 0 ? r.scope.valRate : null, pr = r.prevObservedDays > 0 ? r.scope.pvalRate : null;
  if (cr == null || pr == null || !pr) return { kind: "no_prev", why: "لا فترة سابقة قابلة للمقارنة" };
  const pct = Math.round((cr - pr) / pr * 100);
  return {
    kind: "period_comparison", period: ctx.params.period, location: ctx.params.location,
    cur_daily_rate: round(cr), prev_daily_rate: round(pr), change_pct: pct,
    cur_days: Math.round(r.observedDays * 10) / 10, prev_days: Math.round(r.prevObservedDays * 10) / 10,
    basis: "معدّل يوميّ (قيمة÷أيام) لا مجاميع", note: "المبيعات مقدّرة · المستودع مستبعَد · رفعة التأسيس مستبعَدة"
  };
}

function location_comparison(ctx) {
  const r = computeScope({ ...ctx.data, period: ctx.params.period, location: "all", nowMs: ctx.nowMs });
  const up = new Set(r.uploadedInPeriod);
  const rows = r.dataAll.filter(d => d.loc !== "wh").map(d => up.has(d.loc)
    ? { location: d.name, estimated_sales_incl: round(d.agg.estValue), units: round(d.agg.units), moved_products: d.agg.movedSku.size, inventory_value_incl: d.invValue != null ? round(d.invValue) : null, uploaded: true }
    : { location: d.name, uploaded: false, note: "لا رفعة في هذه الفترة" });
  return {
    kind: "location_comparison", period: ctx.params.period, rows,
    total_estimated_sales_incl: round(r.scope.val), total_units: round(r.scope.units),
    note: "المبيعات مقدّرة · مقارنة الفروع (المستودع له قسمه) · موقع بلا رفعة يظهر «لا رفعة» لا صفر"
  };
}

function stagnant_inventory(ctx) {
  const r = computeScope({ ...ctx.data, period: ctx.params.period, location: ctx.params.location, nowMs: ctx.nowMs });
  if (r.observedDays < RATE_MIN_DAYS) return { kind: "insufficient_history", observed_days: Math.round(r.observedDays * 10) / 10, need_days: RATE_MIN_DAYS, metric: "المخزون الراكد" };
  const limit = ctx.params.limit || 20;
  const soldSku = new Set();
  const { movs } = cleanMovements(ctx.data.movements, ctx.data.uploads);
  const { since } = salesRange(ctx.params.period, ctx.nowMs);
  const shown = ctx.params.location === "all" ? r.branchLocs : [ctx.params.location];
  for (const m of movs) if (m.kind === "estimated_sale" && bizTs(m.captured_at) >= since && shown.includes(m.location)) soldSku.add(String(m.sku));
  const items = (ctx.data.stock || []).filter(s => shown.includes(s.location) && Number(s.qty) > 0 && !soldSku.has(String(s.sku)))
    .map(s => ({ sku: String(s.sku), name: s.name || "", qty: round(s.qty), inventory_value_incl: round((Number(s.qty) || 0) * (Number(s.price_incl) || 0)) }))
    .sort((a, b) => b.inventory_value_incl - a.inventory_value_incl).slice(0, limit);
  return { kind: "stagnant_inventory", period: ctx.params.period, location: ctx.params.location, items, sort_basis: "قيمة المخزون الراكد (شامل)", note: "لم تُسجَّل له حركة بيع في الفترة" };
}

function stockout_risk(ctx) {
  const r = computeScope({ ...ctx.data, period: ctx.params.period, location: ctx.params.location, nowMs: ctx.nowMs });
  if (r.observedDays < RATE_MIN_DAYS) return { kind: "insufficient_history", observed_days: Math.round(r.observedDays * 10) / 10, need_days: RATE_MIN_DAYS, metric: "مخاطر النفاد" };
  const limit = ctx.params.limit || 20;
  const items = r.dataAll.filter(d => d.loc !== "wh" && (ctx.params.location === "all" || d.loc === ctx.params.location))
    .flatMap(d => (d.coverage != null && d.dailyRate > 0) ? [{ location: d.name, coverage_days: d.coverage }] : []);
  return { kind: "stockout_risk", period: ctx.params.period, location: ctx.params.location, by_location: items, threshold_days: 30, note: "أيام التغطية = الكمية الحالية ÷ المعدّل اليوميّ للبيع" };
}

function inventory_value(ctx) {
  // 🚨 قيمة المخزون تشمل المستودع (مخزون فعليّ) — بخلاف مؤشّرات المبيعات
  const r = computeScope({ ...ctx.data, period: ctx.params.period, location: ctx.params.location, nowMs: ctx.nowMs });
  return {
    kind: "inventory_value", location: ctx.params.location,
    inventory_value_incl: round(r.invScope.inv), inventory_value_excl: round(r.invScope.invExcl),
    items_missing_excl_price: r.invScope.invExclMiss,
    includes_warehouse: r.invLocsShown.includes("wh"),
    note: "قيمة المخزون الحاليّ (لقطة) — يشمل المستودع · أصناف بلا سعر قبل الضريبة مستبعَدة من الصافي لا محسوبة صفراً"
  };
}

function data_freshness(ctx) {
  const bm = new Map(ctx.data.branches.map(b => [b.id, b.name])); bm.set("wh", "المستودع");
  const latest = new Map();
  for (const u of ctx.data.uploads || []) { const t = Date.parse(u.captured_at); if (Number.isFinite(t) && (!latest.has(u.location) || t > latest.get(u.location))) latest.set(u.location, t); }
  const per = [...bm.entries()].map(([id, name]) => ({ location: name, last_upload_iso: latest.has(id) ? new Date(latest.get(id)).toISOString() : null }));
  const suspect = (ctx.data.uploads || []).filter(u => u.suspect === true).length;
  return {
    kind: "data_freshness", per_location: per, observed_window_days: Math.round((ctx.observedDays || 0) * 10) / 10,
    suspect_uploads: suspect, note: "«المرصود» = أطول تغطية فرع · الرفعات المشبوهة مستبعَدة من الحساب"
  };
}

function biggest_decliners(ctx) {
  if (ctx.params.period === "all") return { kind: "need_period", why: "«لماذا نزلت» تحتاج فترة محدّدة لمقارنتها بسابقتها" };
  const r = computeScope({ ...ctx.data, period: ctx.params.period, location: ctx.params.location, nowMs: ctx.nowMs });
  if (r.prevBaselineOnly) return { kind: "baseline_only", why: "الفترة السابقة رفعة تأسيس فقط — لا مقارنة" };
  const cd = r.observedDays, pd = r.prevObservedDays;
  if (!(cd > 0) || !(pd > 0)) return { kind: "no_prev", why: "لا فترة سابقة قابلة للمقارنة" };
  const { movs } = cleanMovements(ctx.data.movements, ctx.data.uploads);
  const shown = ctx.params.location === "all" ? r.branchLocs : [ctx.params.location];
  const up = new Set(r.uploadedInPeriod);
  const cur = new Map(), prev = new Map();
  for (const m of movs) {
    if (m.kind !== "estimated_sale" || !shown.includes(m.location) || !up.has(m.location)) continue;
    const t = bizTs(m.captured_at), k = String(m.sku), v = Number(m.value_est) || 0;
    if (t >= r.curSince) { const e = cur.get(k) || { name: m.sku_name || "", v: 0 }; e.v += v; cur.set(k, e); }
    else if (r.prevSince != null && t >= r.prevSince && t < r.curSince) { const e = prev.get(k) || { name: m.sku_name || "", v: 0 }; e.v += v; prev.set(k, e); }
  }
  const keys = new Set([...cur.keys(), ...prev.keys()]);
  const arr = [];
  for (const k of keys) {
    const cr = (cur.get(k)?.v || 0) / cd, pr = (prev.get(k)?.v || 0) / pd;
    const drop = pr - cr;
    if (drop > 0) arr.push({ sku: k, name: (cur.get(k) || prev.get(k)).name, prev_daily_rate: round(pr), cur_daily_rate: round(cr), drop_daily_rate: round(drop) });
  }
  arr.sort((a, b) => b.drop_daily_rate - a.drop_daily_rate);
  return {
    kind: "biggest_decliners", period: ctx.params.period, location: ctx.params.location,
    items: arr.slice(0, ctx.params.limit || 20), cur_days: Math.round(cd * 10) / 10, prev_days: Math.round(pd * 10) / 10,
    phrasing_rule: "أكبر مساهمة ظاهرة في الانخفاض — لا سبب تجاريّ مؤكّد",
    note: "معدّل يوميّ مقابل السابق · المبيعات مقدّرة · المستودع/التأسيس مستبعَدان"
  };
}

export const INTENTS = {
  sales_summary, top_sellers, bottom_sellers, product_movement, period_comparison,
  location_comparison, stagnant_inventory, stockout_risk, inventory_value, data_freshness, biggest_decliners
};

// 🚨 نقص التغطية بيانٌ لا رفض: فترة أطول من المرصود ⇒ يُعطى رقم المرصود ＋ ملاحظة، لا رفض.
//   (الرفض يبقى فقط عند صفر رفعات في النطاق — تعالجه النيّات ككـno_upload.)
//   ⚠ مستقلّ عن بوّابة الجودة (راكد/تغطية/نفاد <14 يوم) — تلك حجبٌ مختلف يبقى.
export function coverageShortfall(observedDays, period) {
  if (period === "all" || period === "today") return null;
  const req = Number(period); if (!Number.isFinite(req)) return null;
  if ((Number(observedDays) || 0) + 0.5 >= req) return null;
  return { observed_days: Math.round((Number(observedDays) || 0) * 10) / 10, requested_days: req };
}
// النيّات التي لا تُلحَق بها ملاحظة النقص (تحكّم/مبوّبة أصلاً)
const SHORTFALL_SKIP = new Set(["insufficient_history", "no_upload", "product_not_found", "disambiguate", "need_period", "baseline_only", "no_prev", "unknown_intent"]);

// ————— تنسيق موحّد بمصطلحات الشاشة (الرقم بفواصله ＋ وحدته) — يُرفَق جاهزاً فلا يُنسّق النموذج ولا يختار وحدة —————
// 🚨 المصطلحات تطابق الشاشة: المبالغ «ر.س» ＋ شامل/صافي · الكميات «قطعة» · الأصناف «صنف» · الأيام «يوم».
const NF = n => (Math.round(Number(n) || 0)).toLocaleString("en-US");
const NF1 = n => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("en-US");
const M = n => `${NF(n)} ر.س شامل`;
const MX = n => `${NF(n)} ر.س صافي`;
const RATE = n => `${NF(n)} ر.س/يوم`;
const Q = n => `${NF(n)} قطعة`;
const S = n => `${NF(n)} صنف`;
const D = n => `${NF1(n)} يوم`;
const PC = n => `${n > 0 ? "+" : ""}${n}%`;
// يُلحق نصوص display/label الجاهزة حسب نوع النتيجة (لا يمسّ الحقول الرقمية — التكافؤ محفوظ)
function applyDisplay(res) {
  if (!res || typeof res !== "object") return res;
  switch (res.kind) {
    case "sales_summary":
      res.display = { estimated_sales: M(res.estimated_sales_incl), estimated_sales_excl: MX(res.estimated_sales_excl), units: Q(res.units), moved_products: S(res.moved_products), observed: D(res.observed_days) }; break;
    case "top_sellers": case "bottom_sellers":
      (res.items || []).forEach(it => { it.label = `${it.name}: ${M(it.value)} · ${Q(it.units)}`; }); break;
    case "product_movement":
      res.display = { total_units: Q(res.total_units), total_value: M(res.total_value_incl) };
      (res.per_location || []).forEach(e => { e.label = `${e.location}: ${Q(e.units)} · ${M(e.value)}`; }); break;
    case "period_comparison":
      res.display = { cur_daily_rate: RATE(res.cur_daily_rate), prev_daily_rate: RATE(res.prev_daily_rate), change: PC(res.change_pct), cur_days: D(res.cur_days), prev_days: D(res.prev_days) }; break;
    case "location_comparison":
      (res.rows || []).forEach(r => { r.label = r.uploaded ? `${r.location}: ${M(r.estimated_sales_incl)} · ${Q(r.units)} · ${S(r.moved_products)}` : `${r.location}: لا رفعة في هذه الفترة`; });
      res.display = { total_estimated_sales: M(res.total_estimated_sales_incl), total_units: Q(res.total_units) }; break;
    case "stagnant_inventory":
      (res.items || []).forEach(it => { it.label = `${it.name}: ${Q(it.qty)} · قيمة المخزون ${M(it.inventory_value_incl)}`; }); break;
    case "stockout_risk":
      (res.by_location || []).forEach(e => { e.label = `${e.location}: تغطية ${D(e.coverage_days)}`; }); break;
    case "inventory_value":
      res.display = { inventory_value: M(res.inventory_value_incl), inventory_value_excl: MX(res.inventory_value_excl) }; break;
    case "data_freshness":
      res.display = { observed_window: D(res.observed_window_days) }; break;
    case "biggest_decliners":
      (res.items || []).forEach(it => { it.label = `${it.name}: من ${RATE(it.prev_daily_rate)} إلى ${RATE(it.cur_daily_rate)} (انخفاض ${RATE(it.drop_daily_rate)})`; });
      res.display = { cur_days: D(res.cur_days), prev_days: D(res.prev_days) }; break;
  }
  return res;
}

// تشغيل نيّة بعد التحقّق (index.ts يمرّر params مُنقّاة ＋ data ＋ nowMs ＋ observedDays)
export function runIntent(key, ctx) {
  const fn = INTENTS[key];
  if (!fn) return { kind: "unknown_intent", key };
  const res = fn(ctx);
  const cs = coverageShortfall(ctx.observedDays, ctx.params.period);
  if (cs && res && !SHORTFALL_SKIP.has(res.kind)) { res.coverage_shortfall = cs; res.coverage_shortfall.display = `المرصود ${D(cs.observed_days)} من ${D(cs.requested_days)} المطلوبة`; }   // بيان نقص لا رفض
  return applyDisplay(res);   // أرقام منسّقة بوحداتها جاهزة للنموذج (لا يُنسّق ولا يختار وحدة)
}
