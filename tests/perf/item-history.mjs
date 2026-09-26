// ============================================================================
// G-ITEM-HISTORY — «حركة الصنف» (البحث الثالث، عرض-فقط) بالقيمة لا الشكل:
//   ① 🚫 صفر استعلام قاعدة عند التحميل (activity_log/sales_movements لا يُلمسان قبل الضغط).
//   ② الضغط ⇒ ≥1 استعلام لكلٍّ (getBySku ＋ movementsBySku) — الاستثناء المسموح.
//   ③ قسمان: «قرارات الأداة» (أبرز) ＋ «حركة المخزون (للسياق)» (details مطويّ).
//   ④ 🚫 لا قسم أوّل فارغ بلا تفسير: مربوط بلا قرارات ⇒ رسالة · غير مربوط ⇒ بيان صريح.
//   ⑤ «آخر موقع» يُشتقّ من أحدث حدث موقعيّ (العزيزية) — لا «—» ولا إحالة «بحث في المخزن».
//   ⑥ viewer محجوب عن sales_movements ⇒ بيان داخل القسم الثانويّ ＋ آخر موقع «غير معروف».
//   ⑦ صفر رقم بأكثر من منزلة عشرية واحدة في البطاقة (period_days مقرّب).
// --broken: فرع «مربوط بلا قرارات» يصير "" ⇒ قسم أوّل فارغ بلا تفسير ⇒ يرسب (④).
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
  const A = 'else if (linked) primBody += `<div class="q-empty">هذا الصنف مربوط، لكن لم تُسجَّل الأداة أي قرار فيه بعد ${IH_LOG_SINCE}.</div>`;';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد فرع «مربوط بلا قرارات»"); process.exit(2); }
  html = html.replace(A, 'else if (linked) primBody += "";');   // قسم أوّل فارغ بلا تفسير
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(async () => {
  const counts = { activity_log: 0, sales_movements: 0 };
  const MOV = [{ sku: "Z1", location: "az", captured_at: new Date(Date.now() - 9e7).toISOString(), period_days: 1.2839754050925927, qty_before: 10, qty_after: 6, delta: -4, kind: "estimated_sale" }];
  const chain = (data) => { const o = { select: () => o, eq: () => o, order: () => o, range: async () => ({ data, error: null }) }; return o; };
  const mkSb = (movBlocked, movData) => ({ from: (t) => { if (t in counts) counts[t]++; if (t === "sales_movements" && movBlocked) return { select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: "RLS" } }) }) }) }) }; return chain(t === "activity_log" ? [] : (movData || [])); } });

  dbOnline = true; invBranches = [{ id: "az", name: "العزيزية" }]; famIndex = null; zidIndexCache = null;
  authSession = { user: { id: "u1", email: "o@x.sa" } };
  salesAllLocs = () => [{ id: "az", name: "العزيزية" }];
  stData = { header: ["sku", "name_ar", "price", "quantity", "published", "barcode"],
             rows: [["sku", "name_ar", "price", "quantity", "published", "barcode"], ["Z1", "كرسي اختبار", 100, 5, "Yes", "B1"]] };

  // ① التحميل: لم يُلمس أي جدول
  manualMap = { "Z1": "W100" };            // مربوط
  sb = mkSb(false, MOV);
  const atLoad = { ...counts };

  // ② الضغط ⇒ استعلام الجدولين (نشاط فارغ ⇒ «مربوط بلا قرارات» · حركة واحدة ⇒ آخر موقع + ثانويّ)
  document.getElementById("ihQuery").value = "Z1";
  runItemHistory();
  await new Promise(r => setTimeout(r, 70));
  const afterSubmit = { ...counts };
  const box = document.getElementById("ihResults");
  const txt = box.textContent;
  const hasPrimary = txt.includes("قرارات الأداة");
  const hasSecondary = !!box.querySelector("details.ih-more") && txt.includes("حركة المخزون");
  const linkedEmptyMsg = txt.includes("مربوط، لكن لم تُسجَّل");
  const hasState = !!box.querySelector(".ih-state");
  const hasDisclaimer = txt.includes("ما قبل التفعيل غير مسجَّل");
  const lastLocOk = txt.includes("العزيزية") && !txt.includes("بحث في المخزن");
  const noRawDecimal = (txt.match(/\d+\.\d{2,}/g) || []).length === 0;   // ⑦ لا رقم بمنزلتين+

  // ④ب غير مربوط ⇒ بيان صريح في القسم الأوّل
  manualMap = {};
  sb = mkSb(false, MOV);
  runItemHistory(); await new Promise(r => setTimeout(r, 70));
  const unlinkedBanner = document.getElementById("ihResults").textContent.includes("غير مربوط بمنتج زد");

  // ⑥ viewer: sales_movements محجوب ⇒ بيان + آخر موقع «غير معروف»
  manualMap = { "Z1": "W100" };
  counts.activity_log = 0; counts.sales_movements = 0; sb = mkSb(true);
  runItemHistory(); await new Promise(r => setTimeout(r, 70));
  const vt = document.getElementById("ihResults").textContent;
  const viewerNote = vt.includes("محجوبة عن دورك");
  const lastLocUnknown = vt.includes("غير معروف");

  return { atLoad, afterSubmit, hasPrimary, hasSecondary, linkedEmptyMsg, hasState, hasDisclaimer, lastLocOk, noRawDecimal, unlinkedBanner, viewerNote, lastLocUnknown };
});
await b.close();

if (BROKEN) {
  if (!res.linkedEmptyMsg) { console.log("✅ (--broken) G-ITEM-HISTORY مسك العطل: قسم «قرارات الأداة» فارغ بلا تفسير للمربوط."); process.exit(0); }
  console.error("✗ (--broken) لم يُرصَد الفراغ بلا تفسير — لا أسنان. " + JSON.stringify(res)); process.exit(1);
}
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (res.atLoad.activity_log !== 0 || res.atLoad.sales_movements !== 0) fails.push(`① استعلام عند التحميل: ${JSON.stringify(res.atLoad)} (يجب 0/0)`);
if (res.afterSubmit.activity_log < 1) fails.push("② الضغط لم يستعلم activity_log");
if (res.afterSubmit.sales_movements < 1) fails.push("② الضغط لم يستعلم sales_movements");
if (!res.hasPrimary) fails.push("③ القسم الأوّل «قرارات الأداة» غائب");
if (!res.hasSecondary) fails.push("③ القسم الثانويّ «حركة المخزون» (details) غائب");
if (!res.linkedEmptyMsg) fails.push("④ مربوط بلا قرارات: القسم الأوّل فارغ بلا تفسير");
if (!res.unlinkedBanner) fails.push("④ غير مربوط: بيان «غير مربوط بمنتج زد» غائب");
if (!res.hasState) fails.push("سطر حالة الصنف غائب");
if (!res.hasDisclaimer) fails.push("بيان «ما لا يشمله الخطّ» غائب");
if (!res.lastLocOk) fails.push("⑤ «آخر موقع» لا يطابق أحدث حدث موقعيّ (العزيزية) أو ما زال يُحيل لـ«بحث في المخزن»");
if (!res.noRawDecimal) fails.push("⑦ رقم بأكثر من منزلة عشرية واحدة ظهر في البطاقة");
if (!res.viewerNote) fails.push("⑥ بيان الحجب عن viewer غائب عند حجب sales_movements");
if (!res.lastLocUnknown) fails.push("⑥ آخر موقع ليس «غير معروف» عند حجب الحركة");
if (fails.length) { console.error("✗ G-ITEM-HISTORY:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-ITEM-HISTORY: صفر استعلام عند التحميل · الضغط يستعلم الجدولين · قسمان (قرارات/حركة) · الفراغ مُفسَّر (مربوط/غير مربوط) · آخر موقع مشتقّ · لا عشريّ خام · حجب viewer معلن.");
