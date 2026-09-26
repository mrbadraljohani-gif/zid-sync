// ============================================================================
// G-AI-PARITY — تكافؤ المساعد مع الشاشة (أهمّ حارس في المشروع، القيمة لا الشكل):
//   ① لنفس الفترة/الموقع: رقم المساعد (computeScope) = رقم الشاشة بالضبط. المستودع مستبعَد من الطرفين
//      ⇒ 36,588 (9,772 + 26,816) لا 56,268 (سحب 19,680).
//   ② فترة أطول من المرصود (7 مطلوبة · 5 مرصودة): المساعد يعطي **نفس رقم الشاشة** ＋ coverage_shortfall
//      (بيان نقص) — 🚫 لا رفض. (الشاشة تعرض الرقم لنفس الفلتر بلا اعتراض.)
// 🚨 sales_compute.mjs/intents.mjs نسخة موازية للشاشة (الشاشة لا تستوردها) — هذا الحارس يكشف أي انحراف.
// --broken:        يكسر استثناء المستودع (l!=="wh" ⇒ true) ⇒ رقم المساعد يتضخّم ⇒ يخالف الشاشة ⇒ يرسب.
// --broken-window: يُعيد الرفض القديم بدل بيان النقص ⇒ الفحص ③ لا يجد رقماً ⇒ يرسب (رسوبه على السلوك القديم).
// ============================================================================
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const AIDIR = join(root, "supabase", "functions", "ai-assistant");
const BROKEN = process.argv.includes("--broken");
const BROKEN_WIN = process.argv.includes("--broken-window");
const html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");

// تجهيزة موحّدة للشاشة والدالّة النقيّة (period_days=5 ⇒ مرصود 5 يوم < 7 المطلوبة ⇒ نقص تغطية)
const now = new Date().toISOString();
const branches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
const mv = (loc, sku, q, v) => ({ kind: "estimated_sale", delta: -q, value_est: v, unit_price_incl: v / q, unit_price_excl: Math.round(v / q / 1.15), location: loc, sku, sku_name: sku, upload_id: "U_" + loc, captured_at: now, period_days: 5 });
const movements = [mv("az", "A1", 500, 9772), mv("kh", "K1", 435, 26816), mv("wh", "W1", 445, 19680)];   // wh سحب — يجب استبعاده
const uploads = [{ id: "U_az", location: "az", captured_at: now, suspect: false }, { id: "U_kh", location: "kh", captured_at: now, suspect: false }, { id: "U_wh", location: "wh", captured_at: now, suspect: false }];
const stock = [{ location: "az", sku: "A1", name: "A1", qty: 100, price_incl: 20, price_excl: 17, cost_price: 8 }, { location: "kh", sku: "K1", name: "K1", qty: 200, price_incl: 30, price_excl: 26, cost_price: 12 }, { location: "wh", sku: "W1", name: "W1", qty: 1000, price_incl: 500, price_excl: 435, cost_price: 200 }];
// 🚨 الدرس (الفخّ الذي أخفى القصّ شهراً): بيانات الحارس يجب أن تتجاوز كل سقف نظام حقيقيّ (1000/طلب).
//    نُضخّم المخزون فوق السقف، وموك الشاشة يفرض سقف 1000/طلب (slice) فيُختبَر تصفيح الشاشة فعليّاً.
const STOCK_FILL = 1200;   // إجمالي 1203 صفّاً > 1000
for (let i = 0; i < STOCK_FILL; i++) stock.push({ location: "az", sku: "F" + i, name: "F" + i, qty: 1, price_incl: 10, price_excl: 8, cost_price: 5 });
// قيمة المخزون المتوقّعة للمساعد (incl، يشمل المستودع — 🚫 لا cost في الدفعة ٢): az(100*20 + 1200*10) + kh(200*30) + wh(1000*500) = 520000
const EXPECT_INV = 520000;
// دفعة ٢: الشاشة صارت تعرض «قيمة المخزون (تكلفة)» — az(100*8 + 1200*5) + kh(200*12) + wh(1000*200) = 209200
const EXPECT_COST = 209200;

// ————— (أ) أرقام الشاشة (المتصفّح): period=all و period=7 —————
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const screen = await p.evaluate(async (fx) => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = fx.branches; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  db.sales = { uploads: async () => fx.uploads, movements: async (loc) => loc === "all" ? fx.movements : fx.movements.filter(m => m.location === loc), clearSuspect: async () => {} };
  // 🚨 الموك يفرض سقف الخادم: كل .range(from,to) يُرجع شريحة بحجمها فقط ⇒ تصفيح الشاشة (salesStockRows) يُختبَر فعليّاً على >1000
  sb = { rpc: async () => ({ data: [{ used: 0, cap: 500 }], error: null }), from: () => ({ select: () => ({ range: async (from, to) => ({ data: fx.stock.slice(from, to + 1), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const rr = document.getElementById("result"); if (rr) rr.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  const read = async (per) => { salesPeriod = per; await renderSalesPage(); const el = document.querySelector('#salesKpis .kpi[data-k="sval"] b'); return el ? (el.textContent || "").replace(/[^\d]/g, "") : ""; };
  const all = await read("all");
  const invEl = document.querySelector('#salesKpis .kpi[data-k="sinv"] b'); const inv = invEl ? (invEl.textContent || "").replace(/[^\d]/g, "") : "";
  return { all, p7: await read("7"), inv };
}, { branches, movements, uploads, stock });
await b.close();

// ————— (ب) أرقام المساعد (الدالّة النقيّة) — من المصدر الحقيقيّ أو المكسور —————
const tmps = [];
let computeSrc = join(AIDIR, "sales_compute.mjs"), intentsSrc = join(AIDIR, "intents.mjs");
if (BROKEN) {
  let s = readFileSync(computeSrc, "utf8");
  const A = 'const branchLocs = locsAll.filter(l => l !== "wh");';
  if (!s.includes(A)) { console.error("✗ (--broken) لم أجد استثناء المستودع"); process.exit(2); }
  computeSrc = join(AIDIR, "_broken_compute.mjs"); writeFileSync(computeSrc, s.replace(A, 'const branchLocs = locsAll.filter(l => true);')); tmps.push(computeSrc);
  // intents يستورد ./sales_compute.mjs — أنشئ نسخة intents تستورد المكسور
  let it = readFileSync(join(AIDIR, "intents.mjs"), "utf8").replace('from "./sales_compute.mjs"', 'from "./_broken_compute.mjs"');
  intentsSrc = join(AIDIR, "_broken_intents.mjs"); writeFileSync(intentsSrc, it); tmps.push(intentsSrc);
}
if (BROKEN_WIN) {
  let it = readFileSync(intentsSrc, "utf8");
  const A = 'if (cs && res && !SHORTFALL_SKIP.has(res.kind)) { res.coverage_shortfall = cs; res.coverage_shortfall.display = `البيانات المتاحة تغطّي ${NF1(cs.observed_days)} يوم من ${daysWord(cs.requested_days)} المطلوبة`; }   // بيان نقص لا رفض (العدد والمعدود صحيح)';
  if (!it.includes(A)) { console.error("✗ (--broken-window) لم أجد سطر بيان النقص"); process.exit(2); }
  it = it.replace(A, 'if (cs) return applyDisplay({ kind: "insufficient_window", observed_days: cs.observed_days, requested_days: cs.requested_days });   // (--broken-window) الرفض القديم');
  intentsSrc = join(AIDIR, "_broken_win_intents.mjs"); writeFileSync(intentsSrc, it); tmps.push(intentsSrc);
}
const { computeScope } = await import(pathToFileURL(computeSrc).href);
const { runIntent } = await import(pathToFileURL(intentsSrc).href);
const { observedWindowDays } = await import(pathToFileURL(join(AIDIR, "sales_compute.mjs")).href);
const nowMs = Date.parse(now);
const data = { movements, uploads, stock, branches };
const observedDays = observedWindowDays(movements, uploads, branches, nowMs);
const scopeAll = computeScope({ ...data, period: "all", location: "all", nowMs });
const valAll = String(Math.round(scopeAll.scope.val));
const invAll = String(Math.round(scopeAll.invScope.inv));   // قيمة المخزون (all، يشمل المستودع) على >1000 صفّ
const res7 = runIntent("sales_summary", { params: { period: "7", location: "all" }, data, nowMs, observedDays });
const val7 = res7 && res7.estimated_sales_incl != null ? String(res7.estimated_sales_incl) : "";
// (٩-د) الوضع المركّب: نيّة ثانية (مقارنة المواقع) — إجماليّها يطابق الشاشة أيضاً (المستودع مستبعَد)
const resCmp = runIntent("location_comparison", { params: { period: "all", location: "all" }, data, nowMs, observedDays });
const valCmp = resCmp && resCmp.total_estimated_sales_incl != null ? String(resCmp.total_estimated_sales_incl) : "";
for (const t of tmps) unlinkSync(t);

// ————— النتائج —————
const fails = [];
if (errs.length) fails.push("أخطاء JS في الشاشة: " + errs.join(" | "));
if (screen.all !== "36588") fails.push(`رقم الشاشة (all) ليس 36,588: «${screen.all}»`);
if (screen.p7 !== "36588") fails.push(`رقم الشاشة (7 أيام) ليس 36,588: «${screen.p7}»`);

if (BROKEN) {
  // إدخال المستودع يتضخّم في المفرد والمركّب معاً
  if (valAll === "56268" && valCmp === "56268" && valAll !== screen.all) { console.log(`✅ (--broken) مسك الانحراف: المفرد ${valAll} والمركّب ${valCmp} ≠ الشاشة ${screen.all} (دخل المستودع).`); process.exit(0); }
  console.error(`✗ (--broken) لم يُكتشف الانحراف — لا أسنان (مفرد=${valAll} · مركّب=${valCmp} · شاشة=${screen.all}).`); process.exit(1);
}
if (BROKEN_WIN) {
  // الرفض القديم ⇒ res7.kind=insufficient_window ⇒ لا رقم
  if (res7 && res7.kind === "insufficient_window" && val7 === "") { console.log(`✅ (--broken-window) مسك الرفض القديم: الفحص ③ بلا رقم (kind=${res7.kind}) ⇒ يرسب.`); process.exit(0); }
  console.error(`✗ (--broken-window) لم يرسب الفحص ③ — لا أسنان (val7=${val7} · kind=${res7 && res7.kind}).`); process.exit(1);
}

// ① التكافؤ التامّ
if (valAll !== screen.all) fails.push(`تكافؤ ① منكسر: المساعد ${valAll} ≠ الشاشة ${screen.all}`);
// ③ فترة أطول من المرصود ⇒ نفس الرقم ＋ بيان نقص، لا رفض
if (val7 !== screen.p7) fails.push(`تكافؤ ③ منكسر: المساعد (7 أيام) ${val7} ≠ الشاشة ${screen.p7} — رفَض بدل أن يجيب بالمرصود؟`);
if (!(res7 && res7.coverage_shortfall && res7.coverage_shortfall.requested_days === 7)) fails.push(`الفحص ③: بلا coverage_shortfall (بيان النقص) — «${JSON.stringify(res7 && res7.coverage_shortfall)}»`);
// ④ المركّب: إجماليّ مقارنة المواقع == الشاشة (المستودع مستبعَد)
if (valCmp !== screen.all) fails.push(`تكافؤ ④ (مركّب) منكسر: مقارنة المواقع ${valCmp} ≠ الشاشة ${screen.all}`);
// ⑤ التصفيح على >1000 صفّ (بيانات تتجاوز سقف النظام): كلاهما يقرأ كل الصفوف — لكن بوحدتين بعد الدفعة ٢:
//    المساعد قيمة المخزون **incl** (🚫 لا cost في الدفعة ٢) · الشاشة «قيمة المخزون (تكلفة)». تطابقٌ لا يصحّ هنا — التصفيح يُثبَت بأنّ كليهما يبلغ متوقّعه الكامل.
if (invAll !== String(EXPECT_INV)) fails.push(`قيمة مخزون المساعد (incl) على >1000 صفّ ليست ${EXPECT_INV} — تصفيح المساعد مقصوص؟: «${invAll}»`);
if (screen.inv !== String(EXPECT_COST)) fails.push(`قيمة مخزون الشاشة (تكلفة، تصفيح >1000) ليست ${EXPECT_COST} — تصفيح الشاشة مقصوص أو التكلفة لم تُقرأ؟: «${screen.inv}»`);

if (fails.length) { console.error("✗ G-AI-PARITY:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-AI-PARITY: ① مفرد=${valAll} · ③ فترة 7 ⇒ ${val7} ＋ بيان نقص · ④ مركّب=${valCmp} · ⑤ تصفيح >1000: المساعد incl=${invAll} · الشاشة تكلفة=${screen.inv} (كلاهما كامل بلا قصّ) — بتطابق تامّ.`);
