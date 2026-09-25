// ============================================================================
// G-NOCAND — «بلا مرشّح موثوق» لا يعرض مرشّحاً ضعيفاً ولا يسمح باعتماده (القيمة، لا الشكل):
//   ① بطاقة حمراء (best.score<40) ⇒ 🚫 لا اسم/كود المرشّح الضعيف في عمود المستودع · «لا مرشّح موثوق — ابحث يدوياً» · صندوق disabled.
//   ② بطاقة موثوقة (اسم تامّ ⇒ أخضر) ⇒ المرشّح **معروض** والصندوق **مفعّل** (سلوكها لم يتغيّر).
// --broken: batchWhInner يعرض المرشّح الضعيف رغم unreliable ⇒ كود «براد» يظهر مع «بلا مرشّح» ⇒ يرسب.
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
  const A = 'if (!c || unreliable) return `<div class="mc-none">لا مرشّح موثوق — ابحث يدوياً لاختيار صنف من المستودع</div>`;';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد حارس المرشّح غير الموثوق"); process.exit(2); }
  html = html.replace(A, 'if (!c) return `<div class="mc-none">لا مرشّح</div>`;');   // يعرض الضعيف رغم unreliable
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  famIndex = null; manualMap = {}; boundSet = new Set(); waitingSet = new Set(); lastMerge = { unified: [], noPrice: [] }; mergeWh = []; mergeBranches = [];
  // أحمر: «حبل Daslo - اسود» مرشّحه الضعيف «براد استيل NK-40» (كود 420806، درجة 20)
  const red = { z: { sku: "Z-HABL", name: "حبل Daslo - اسود", price: 55, qty: 3, published: "Yes" }, best: { code: "420806", name: "براد استيل يد اسود NK-40", price: 55, qty: 10, score: 20, sizeM: false, priceM: true, sim: 0.1 }, isAbsent: false, wasLinked: false };
  red.chosen = red.best;
  const redHtml = batchCardHTML(red, "bt-rd", "");
  // أخضر موثوق: اسم تامّ
  const grn = { z: { sku: "Z-OK", name: "كرسي ارضي M2", price: 100, qty: 5, published: "Yes" }, best: { code: "70373", name: "كرسي ارضي M2", price: 100, qty: 5, score: 100, exactName: true, sizeM: true, priceM: true, sim: 1 }, exactUnique: true, isAbsent: false, wasLinked: false };
  grn.chosen = grn.best;
  const grnHtml = batchCardHTML(grn, "bt-g", "");
  // البند ٢: بطاقة غائبة لها كود سابق (mappedCode) — تعرض الكود ＋ «—» للموقع/الاختفاء ＋ إحالة
  const abs = { z: { sku: "Z-ABS", name: "حبل Daslo - احمر", price: 55, qty: 2, published: "Yes", mappedCode: "99999" }, best: null, isAbsent: true, wasLinked: false };
  abs.chosen = null;
  const absHtml = batchCardHTML(abs, "bt-rd", "");
  return { redHtml, grnHtml, absHtml };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const red = res.redHtml, grn = res.grnHtml;
if (BROKEN) {
  if (/420806/.test(red) || /براد استيل/.test(red)) { console.log("✅ (--broken) G-NOCAND مسك العطل: المرشّح الضعيف (براد/420806) ظهر في البطاقة الحمراء."); process.exit(0); }
  console.error("✗ (--broken) لم يظهر المرشّح الضعيف — لا أسنان."); process.exit(1);
}
// ① الأحمر: لا مرشّح ضعيف · رسالة · صندوق معطّل
if (/420806/.test(red)) fails.push("① كود المرشّح الضعيف (420806) معروض في البطاقة الحمراء");
if (/براد استيل/.test(red)) fails.push("① اسم المرشّح الضعيف (براد استيل) معروض في البطاقة الحمراء");
if (!/لا مرشّح موثوق — ابحث يدوياً/.test(red)) fails.push("① رسالة «لا مرشّح موثوق — ابحث يدوياً» غائبة");
if (!/data-uid="[^"]*"[^>]*\sdisabled/.test(red) && !/\sdisabled[^>]*data-uid=/.test(red)) fails.push("① صندوق الاعتماد ليس disabled في البطاقة الحمراء");
// ② الأخضر الموثوق: المرشّح معروض · الصندوق مفعّل (سلوكه لم يتغيّر)
if (!/70373/.test(grn)) fails.push("② المرشّح الموثوق (70373) غير معروض في الأخضر");
if (!/كرسي ارضي M2/.test(grn)) fails.push("② اسم المرشّح الموثوق غير معروض");
if (/data-uid="[^"]*"[^>]*\sdisabled/.test(grn) || /\sdisabled[^>]*data-uid=/.test(grn)) fails.push("② صندوق الأخضر معطّل (يجب أن يبقى مفعّلاً)");
// البند ٢: الغائب يعرض الكود السابق ＋ «—» للموقع/الاختفاء ＋ سطر الإحالة
const abs = res.absHtml;
if (!/الكود السابق:\s*<span dir="ltr">99999/.test(abs)) fails.push("البند٢: الكود السابق (99999) غير معروض في البطاقة الغائبة");
if (!/آخر موقع:\s*<span class="q-na">—/.test(abs)) fails.push("البند٢: «آخر موقع: —» غائبة");
if (!/اختفى:\s*<span class="q-na">—/.test(abs)) fails.push("البند٢: «اختفى: —» غائبة");
if (!/حركة الصنف/.test(abs)) fails.push("البند٢: سطر الإحالة إلى «حركة الصنف» غائب");
if (fails.length) { console.error("✗ G-NOCAND:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-NOCAND: الأحمر بلا مرشّح ضعيف ＋ صندوق معطّل · الأخضر الموثوق سليم · الغائب يعرض الكود السابق ＋ «—» ＋ إحالة «حركة الصنف».");
