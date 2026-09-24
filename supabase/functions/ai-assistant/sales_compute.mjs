// ============================================================================
// sales_compute.mjs — قواعد حساب المبيعات (الدفعة د)
//
// ⚠ ليس «مصدراً واحداً» بنيوياً: الشاشة (index.html) لا تستورد هذا الملف — تحسب بمنطقها الخاصّ.
//    هذا الملف نسخة موازية، والتطابق **مُختبَر عبر G-AI-PARITY** لا مضمون بنيوياً.
// 🚨 أيّ تعديل على قواعد الحساب في index.html يلزمه تعديل مقابل هنا — وG-AI-PARITY هو ما يكشف النسيان.
//
// 🚨 هذه نفس قواعد شاشة عرض المبيعات في index.html حرفياً — لا قاعدة جديدة:
//   ① المستودع (location==='wh') مستبعَد من كل مقياس مبيعات (مخزن لا نقطة بيع).
//      حركات سحبه مخزَّنة kind='estimated_sale' ومعناها سحب — تُستبعَد بـlocation لا بـkind.
//   ② الفترات بـbusiness_date (اليوم السابق للرفعة) بتوقيت الرياض (UTC+3)، لا captured_at.
//   ③ رفعة التأسيس (كل حركاتها kind='new') مستبعَدة من أي حساب/مقارنة.
//   ④ الرفعات المشبوهة (suspect) مستبعَدة.
//   ⑤ المقارنات بمعدّل يوميّ (قيمة÷أيام الفترة) لا بمجاميع.
//   ⑥ القيم من value_est/unit_price_excl/price_incl/price_excl مباشرةً — لا ضرب/قسمة على 1.15.
//   ⑦ موقع بلا رفعة غير-تأسيسية في الفترة ⇒ مستبعَد من الإجماليّ (uploadedInPeriod).
//
// يستورده: (أ) Edge Function ai-assistant  (ب) حارس G-AI-PARITY — فينحرفان معاً أو لا ينحرفان.
// نقيّ تماماً: بلا شبكة ولا DOM ولا زمن ضمنيّ (nowMs يُمرَّر). ESM يعمل في Deno وNode معاً.
// ============================================================================

export const RIY_OFF = 3 * 3600000; // توقيت الرياض

// 🚨 فرعا شاشة المبيعات فقط (يقابل SALES_EXTRA_LOCS في index.html) — يُضمّان لتعداد فروع المبيعات في الدالّة.
//    معزولان عن زد بنيويّاً: الدالّة الطرفية قراءةٌ لشاشة المبيعات فقط، لا تمسّ ملفَّي زد إطلاقاً.
//    عند إضافة فرع مبيعات جديد: عدّل هنا وفي index.html (فرعا زد يأتيان من جدول branches تلقائياً).
export const SALES_EXTRA_LOCS = [{ id: "haraj_maf", name: "الحراج مفروشات" }, { id: "haraj_reh", name: "الحراج رحلات" }];

const numOrNull = v => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

export function riyadhDay(ts) {
  const t = (typeof ts === "number" ? ts : Date.parse(ts));
  if (!Number.isFinite(t)) return "";
  return new Date(t + RIY_OFF).toISOString().slice(0, 10);
}
// business_date = اليوم السابق للرفعة (الملف يعكس رصيد أمس) بالرياض
export function bizDate(ts) {
  const t = Date.parse(ts); if (!Number.isFinite(t)) return "";
  const d = new Date(t + RIY_OFF); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export function bizTs(ts) { const bd = bizDate(ts); return bd ? Date.parse(bd + "T00:00:00+03:00") : NaN; }
export function shiftYmd(ymd, deltaDays) { const t = Date.parse(ymd + "T12:00:00Z"); return Number.isFinite(t) ? new Date(t + deltaDays * 86400000).toISOString().slice(0, 10) : ymd; }

// نافذة الفترة (مطابِقة salesRange في الشاشة) — nowMs يُمرَّر (لا Date.now ضمنيّ)
export function salesRange(period, nowMs) {
  const now = nowMs, day = 86400000;
  if (period === "all") return { since: -Infinity, prevSince: null };
  let since, span;
  if (period === "today") { since = Date.parse(shiftYmd(riyadhDay(now), -1) + "T00:00:00+03:00"); span = day; }
  else { const d = Number(period); span = d * day; since = now - span; }
  return { since, prevSince: since - span };
}

// التجميع (مطابِق salesAgg): القيمة/الوحدات من estimated_sale فقط · المختفي منفصل · «متحرّكة» فريدة
export function agg(rows) {
  const a = { estValue: 0, estValueExcl: 0, units: 0, moved: new Set(), movedSku: new Set(), noPrice: 0, disCount: 0, disValue: 0, byLoc: new Map() };
  for (const m of rows || []) {
    a.moved.add(m.location + "|" + m.sku); a.movedSku.add(String(m.sku));
    if (m.kind === "estimated_sale") {
      const u = Math.abs(Number(m.delta) || 0); a.units += u;
      const L = a.byLoc.get(m.location) || { value: 0, valueExcl: 0, units: 0 }; L.units += u;
      if (m.value_est != null) { a.estValue += Number(m.value_est) || 0; L.value += Number(m.value_est) || 0; } else a.noPrice++;
      if (m.unit_price_excl != null) { const ve = u * (Number(m.unit_price_excl) || 0); a.estValueExcl += ve; L.valueExcl += ve; }
      a.byLoc.set(m.location, L);
    } else if (m.kind === "disappeared") { a.disCount++; if (m.value_est != null) a.disValue += Number(m.value_est) || 0; }
  }
  return a;
}

// كشف المشبوهة والتأسيس ثم تنظيف الحركات (مطابِق suspectIds/baselineIds/movs في الشاشة)
export function cleanMovements(rawMovements, uploads) {
  const suspectIds = new Set((uploads || []).filter(u => u.suspect === true).map(u => u.id));
  const notSuspect = (rawMovements || []).filter(m => !suspectIds.has(m.upload_id));
  const kindsByUp = new Map();
  for (const m of notSuspect) { let s = kindsByUp.get(m.upload_id); if (!s) { s = new Set(); kindsByUp.set(m.upload_id, s); } s.add(m.kind); }
  const baselineIds = new Set([...kindsByUp].filter(([, ks]) => ks.size > 0 && [...ks].every(k => k === "new")).map(([id]) => id));
  const movs = notSuspect.filter(m => !baselineIds.has(m.upload_id));
  return { movs, suspectIds, baselineIds };
}

// أيام التغطية لموقع = Σ period_days المتمايزة لكل رفعة داخل النافذة (مطابِق daysCovered)
function daysCoveredOf(rows) {
  const perUp = new Map();
  for (const m of rows) if (m.period_days != null && !perUp.has(m.upload_id)) perUp.set(m.upload_id, Number(m.period_days) || 0);
  let d = 0; for (const v of perUp.values()) d += v; return d;
}

// بيانات موقع واحد (مطابِق salesColData): الحاليّ ＋ السابق ＋ المخزون ＋ أيام التغطية
export function colData(loc, movs, stock, curSince, prevSince, locName) {
  const lm = movs.filter(m => m.location === loc);
  const cur = lm.filter(m => bizTs(m.captured_at) >= curSince);
  const prev = prevSince != null ? lm.filter(m => { const t = bizTs(m.captured_at); return t >= prevSince && t < curSince; }) : [];
  const a = agg(cur), pa = agg(prev);
  const srows = stock.filter(r => r.location === loc);
  let invValue = 0, invValueExcl = 0, invExclMissing = 0, totalUnits = 0;
  for (const r of srows) {
    const q = numOrNull(r.qty), p = numOrNull(r.price_incl), pe = numOrNull(r.price_excl);
    if (q != null) totalUnits += q;
    if (q != null && p != null) invValue += q * p;
    if (q != null && pe != null) invValueExcl += q * pe; else if (q != null && pe == null) invExclMissing++;
  }
  const daysCovered = daysCoveredOf(cur), prevDaysCovered = daysCoveredOf(prev);
  const dailyRate = daysCovered > 0 ? a.units / daysCovered : null;
  const coverage = (dailyRate && dailyRate > 0) ? Math.round(totalUnits / dailyRate) : null;
  return {
    loc, name: locName, agg: a, pagg: pa,
    invValue: srows.length ? invValue : null, invValueExcl: srows.length ? invValueExcl : null, invExclMissing,
    totalItems: srows.length, totalUnits, daysCovered, prevDaysCovered, dailyRate, coverage
  };
}

// اسم موقع من خريطة الفروع (wh ثابت)
export function locName(loc, branchMap) { return loc === "wh" ? "المستودع" : (branchMap.get(loc) || String(loc)); }

// ============================================================================
// computeScope — النطاق المجمّع نفسه الذي تعرضه بطاقات KPI في الشاشة (التكافؤ مُختبَر عبر G-AI-PARITY).
//   locsAll = ['wh', ...branchIds] بترتيب الشاشة. location: 'all' | 'wh' | <branchId>.
//   يُرجع أرقام المبيعات (فروع مرفوعة فقط، بلا wh) ＋ المخزون (يشمل wh في 'all').
// ============================================================================
export function computeScope({ movements, uploads, stock, branches, period, location, nowMs }) {
  const branchMap = new Map((branches || []).map(b => [b.id, b.name]));
  const locsAll = ["wh", ...(branches || []).map(b => b.id)];
  const branchLocs = locsAll.filter(l => l !== "wh");
  const { movs, baselineIds } = cleanMovements(movements, uploads);
  const { since: curSince, prevSince } = salesRange(period, nowMs);

  const isWhView = location === "wh";
  // «branches» = كل الفروع بلا المستودع. المبيعات (salesShown) = branchLocs لـ«all» و«branches» معاً (wh مستبعَد أصلاً) ⇒ صفر تغيير في أرقام المبيعات.
  const salesShown = isWhView ? [] : (location === "all" || location === "branches" ? branchLocs : [location]);
  // الفرق الوحيد: المخزون — «all» يشمل المستودع · «branches» يستبعده (branchLocs) · موقع مفرد كما هو.
  const invLocsShown = location === "all" ? locsAll : (location === "branches" ? branchLocs : [location]);

  // موقع «مرفوع في الفترة» = له رفعة غير تأسيسية داخل النافذة
  const uploadedInPeriod = new Set((uploads || []).filter(u => !baselineIds.has(u.id) && bizTs(u.captured_at) >= curSince).map(u => u.location));
  const prevBaselineOnly = prevSince != null
    && (uploads || []).some(u => baselineIds.has(u.id) && bizTs(u.captured_at) >= prevSince && bizTs(u.captured_at) < curSince)
    && !(uploads || []).some(u => !baselineIds.has(u.id) && bizTs(u.captured_at) >= prevSince && bizTs(u.captured_at) < curSince);

  const dataAll = locsAll.map(loc => colData(loc, movs, stock, curSince, prevSince, locName(loc, branchMap)));
  const salesData = dataAll.filter(d => salesShown.includes(d.loc));
  const dataActive = salesData.filter(d => uploadedInPeriod.has(d.loc));       // الإجماليّ من الفروع المرفوعة فقط
  const missingLocs = salesData.filter(d => !uploadedInPeriod.has(d.loc));
  const invData = dataAll.filter(d => invLocsShown.includes(d.loc));           // المخزون يشمل المستودع في 'all'

  const scope = dataActive.reduce((s, d) => {
    s.val += d.agg.estValue; s.valExcl += d.agg.estValueExcl; s.units += d.agg.units;
    s.noPrice += d.agg.noPrice; s.disC += d.agg.disCount; s.disV += d.agg.disValue;
    if (d.daysCovered > 0) { s.valRate += d.agg.estValue / d.daysCovered; s.unitRate += d.agg.units / d.daysCovered; s.daysMax = Math.max(s.daysMax, d.daysCovered); }
    if (d.prevDaysCovered > 0) { s.pvalRate += d.pagg.estValue / d.prevDaysCovered; s.punitRate += d.pagg.units / d.prevDaysCovered; s.pdaysMax = Math.max(s.pdaysMax, d.prevDaysCovered); }
    return s;
  }, { val: 0, valExcl: 0, units: 0, noPrice: 0, disC: 0, disV: 0, valRate: 0, unitRate: 0, pvalRate: 0, punitRate: 0, daysMax: 0, pdaysMax: 0 });

  const invScope = invData.reduce((s, d) => { s.inv += (d.invValue || 0); s.invExcl += (d.invValueExcl || 0); s.invExclMiss += (d.invExclMissing || 0); return s; }, { inv: 0, invExcl: 0, invExclMiss: 0 });

  // منتجات متحرّكة = كود فريد عبر الفروع المرفوعة (مطابِق movedNow)
  const curBranch = movs.filter(m => bizTs(m.captured_at) >= curSince && salesShown.includes(m.location) && uploadedInPeriod.has(m.location));
  const movedNow = new Set(curBranch.map(m => String(m.sku))).size;
  const movedPrev = prevSince != null
    ? new Set(movs.filter(m => { const t = bizTs(m.captured_at); return t >= prevSince && t < curSince && salesShown.includes(m.location) && uploadedInPeriod.has(m.location); }).map(m => String(m.sku))).size
    : null;

  return {
    branchLocs, salesShown, invLocsShown, curSince, prevSince, baselineIds,
    scope, invScope, movedNow, movedPrev,
    observedDays: scope.daysMax, prevObservedDays: scope.pdaysMax, prevBaselineOnly,
    uploadedInPeriod: [...uploadedInPeriod], missingLocs, dataActive, dataAll, invData,
    branchMap
  };
}

// أيام الرصد الكليّة عبر الفروع (لحارس «فترة أطول من المرصود») — أطول تغطية موقع، مطابِق observedDays
export function observedWindowDays(movements, uploads, branches, nowMs) {
  const r = computeScope({ movements, uploads, stock: [], branches, period: "all", location: "all", nowMs });
  return r.observedDays || 0;
}
