// ============================================================================
// G-SALES-CORE — نواة لوحة المبيعات المقدّرة (القيمة، لا الشكل):
//   salesAgg: القيمة والوحدات من estimated_sale فقط · المختفي منفصل (disCount/disValue) ·
//     الشراء/الجديد لا يدخلان القيمة · «بلا سعر» يُعدّ في الوحدات لا القيمة · moved = فريدة موقع|كود.
//   renderSalesPage: الرفعة المشبوهة (suspect) مستبعَدة من الإجماليّ · الحالة الفارغة رسالة لا أصفار.
// --broken: يجعل salesAgg يعدّ الشراء بيعاً ⇒ الوحدات 12≠8 ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  const A = 'if (m.kind === "estimated_sale") {';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد فرع estimated_sale في salesAgg"); process.exit(2); }
  html = html.replace(A, 'if (m.kind === "estimated_sale" || m.kind === "purchase") {');   // يخلط الشراء بالبيع
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  // ① salesAgg نقيّ
  const movs = [
    { kind: "estimated_sale", delta: -5, value_est: 500, location: "wh", sku: "A" },
    { kind: "estimated_sale", delta: -3, value_est: null, price_source: "none", location: "wh", sku: "B" },   // بلا سعر
    { kind: "purchase", delta: 4, location: "br1", sku: "C" },
    { kind: "new", delta: 7, location: "wh", sku: "D" },
    { kind: "disappeared", delta: -2, value_est: 1000, location: "wh", sku: "E" },
  ];
  const a = salesAgg(movs);
  // ② render: استبعاد المشبوهة + الحالة الفارغة
  dbOnline = true; invBranches = []; salesPeriod = "all"; salesLoc = "all";
  sb = { from: () => ({ select: () => ({ range: async () => ({ data: [], error: null }) }) }) };   // sales_stock فارغ (قيمة المخزون = 0/—)
  db.sales = {
    uploads: async () => [{ id: "U1", location: "wh", captured_at: new Date().toISOString(), suspect: false }, { id: "U2", location: "wh", captured_at: new Date().toISOString(), suspect: true }],
    movements: async () => [
      { kind: "estimated_sale", delta: -5, value_est: 500, location: "wh", sku: "A", upload_id: "U1", captured_at: new Date().toISOString() },
      { kind: "estimated_sale", delta: -2, value_est: null, price_source: "none", location: "wh", sku: "NP", upload_id: "U1", captured_at: new Date().toISOString() },   // بلا سعر ⇒ عدّاد
      { kind: "estimated_sale", delta: -9, value_est: 9999, location: "wh", sku: "Z", upload_id: "U2", captured_at: new Date().toISOString() },   // مشبوهة ⇒ تُستبعَد
    ],
  };
  await renderSalesPage();
  const kpiVal = (document.querySelector('#salesKpis .kpi[data-k="sval"] bdi') || {}).textContent || "";
  const notes = (document.getElementById("salesNotes") || {}).textContent || "";
  const bodyShown = document.getElementById("salesBody").style.display !== "none";
  // §design-4: جدول مقارنة المواقع — صفّ المستودع قيمته = بيعه المقدّر (500) ＋ صفّ إجماليّ
  const cmpVal = (document.querySelector('#salesCmp tbody tr:not(.total) td.n bdi') || {}).textContent || "";
  const cmpHasTotal = !!document.querySelector('#salesCmp tr.total');
  const chartDrawn = !!document.querySelector('#salesChart svg');
  // ③ الحالة الفارغة
  db.sales.uploads = async () => []; db.sales.movements = async () => [];
  await renderSalesPage();
  const emptyShown = document.getElementById("salesEmpty").style.display !== "none";
  const emptyMsg = (document.getElementById("salesEmpty") || {}).textContent || "";
  return { agg: { estValue: a.estValue, units: a.units, moved: a.moved.size, noPrice: a.noPrice, disCount: a.disCount, disValue: a.disValue, whVal: (a.byLoc.get("wh") || {}).value }, kpiVal, notes, bodyShown, emptyShown, emptyMsg, cmpVal, cmpHasTotal, chartDrawn };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const g = res.agg;
if (g.estValue !== 500) fails.push(`estValue توقّعت 500 (بيع مقدّر فقط)، وجدت ${g.estValue}`);
if (g.units !== 8) fails.push(`units توقّعت 8 (5+3، لا الشراء)، وجدت ${g.units}`);
if (g.moved !== 5) fails.push(`moved توقّعت 5 فريدة، وجدت ${g.moved}`);
if (g.noPrice !== 1) fails.push(`noPrice توقّعت 1 (B بلا سعر)، وجدت ${g.noPrice}`);
if (!(g.disCount === 1 && g.disValue === 1000)) fails.push(`المختفي منفصل — توقّعت disCount=1/disValue=1000، وجدت ${g.disCount}/${g.disValue}`);
if (g.whVal !== 500) fails.push(`byLoc.wh.value توقّعت 500، وجدت ${g.whVal}`);
if (!BROKEN) {
  if (res.kpiVal.replace(/[^\d]/g, "") !== "500") fails.push(`KPI القيمة يشمل المشبوهة — توقّعت 500 (استبعاد U2)، وجدت «${res.kpiVal}»`);
  if (!res.notes.includes("مشبوهة")) fails.push("لا سطر «رفعات مشبوهة مستبعَدة»");
  if (!res.notes.includes("بلا سعر")) fails.push("لا عدّاد «بلا سعر»");
  if (!res.bodyShown) fails.push("جسم اللوحة مخفيّ رغم وجود حركات");
  if (res.cmpVal.replace(/[^\d]/g, "") !== "500") fails.push(`جدول المقارنة — قيمة المستودع: توقّعت 500، وجدت «${res.cmpVal}»`);
  if (!res.cmpHasTotal) fails.push("جدول المقارنة بلا صفّ إجماليّ");
  if (!res.chartDrawn) fails.push("الرسم الخطّي متعدّد المواقع لم يُرسَم");
  if (!(res.emptyShown && /ارفع ملفاً/.test(res.emptyMsg))) fails.push("الحالة الفارغة ليست رسالة «ارفع ملفاً» (أو أظهرت أصفاراً)");
}
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-SALES-CORE مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد خلط الشراء بالبيع — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-SALES-CORE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SALES-CORE: القيمة/الوحدات من البيع المقدّر فقط · المختفي منفصل · بلا سعر معدود لا مُقيَّم · المشبوهة مستبعَدة · الفارغة رسالة.");
