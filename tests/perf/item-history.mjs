// ============================================================================
// G-ITEM-HISTORY — «حركة الصنف» (البحث الثالث، عرض-فقط) بالقيمة لا الشكل:
//   ① 🚫 صفر استعلام قاعدة عند التحميل (activity_log/sales_movements لا يُلمسان قبل الضغط).
//   ② الضغط ⇒ ≥1 استعلام (getBySku) — الاستثناء المسموح «عند الطلب».
//   ③ نتيجة فارغة ⇒ رسالة صريحة (لا صندوق فارغ).
//   ④ viewer محجوب عن sales_movements ⇒ بيان «بعض الأحداث محجوبة عن دورك».
// --broken: فرع النتيجة الفارغة يصير "" ⇒ لا رسالة ⇒ يرسب.
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
  const A = '`<div class="q-empty">لا أحداث مسجَّلة لهذا الصنف بعد ${IH_LOG_SINCE}.</div>`';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد فرع الرسالة الفارغة"); process.exit(2); }
  html = html.replace(A, '""');   // نتيجة فارغة بلا رسالة
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(async () => {
  // عدّاد استعلامات القاعدة حسب الجدول — يُركَّب قبل أي فعل
  const counts = { activity_log: 0, sales_movements: 0 };
  const chain = (data) => { const o = { select: () => o, eq: () => o, order: () => o, range: async () => ({ data, error: null }) }; return o; };
  const mkSb = (movBlocked) => ({ from: (t) => { if (t in counts) counts[t]++; if (t === "sales_movements" && movBlocked) return { select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: "RLS" } }) }) }) }) }; return chain(t === "activity_log" ? [] : []); } });

  dbOnline = true; invBranches = []; manualMap = { "Z1": "W100" }; famIndex = null; zidIndexCache = null;
  authSession = { user: { id: "u1", email: "o@x.sa" } };
  stData = { header: ["sku", "name_ar", "price", "quantity", "published", "barcode"],
             rows: [["sku", "name_ar", "price", "quantity", "published", "barcode"],
                    ["Z1", "كرسي اختبار", 100, 5, "Yes", "B1"]] };

  // ① التحميل: لم يُلمس أي جدول بعد (sb موجود لكنّ الدوال لم تُستدعَ)
  sb = mkSb(false);
  const atLoad = { ...counts };

  // ② الضغط ⇒ استعلام getBySku (activity_log) ＋ movementsBySku (sales_movements)
  document.getElementById("ihQuery").value = "Z1";
  runItemHistory();
  await new Promise(r => setTimeout(r, 60));
  const afterSubmit = { ...counts };
  const box = document.getElementById("ihResults");
  const emptyMsg = box.textContent.includes("لا أحداث مسجَّلة");
  const hasState = !!box.querySelector(".ih-state");
  const hasDisclaimer = box.textContent.includes("ما قبل التفعيل غير مسجَّل");

  // ④ viewer: sales_movements محجوب ⇒ بيان
  counts.activity_log = 0; counts.sales_movements = 0; sb = mkSb(true);
  runItemHistory(); await new Promise(r => setTimeout(r, 60));
  const viewerNote = document.getElementById("ihResults").textContent.includes("محجوبة عن دورك");

  return { atLoad, afterSubmit, emptyMsg, hasState, hasDisclaimer, viewerNote,
           boxLen: box.textContent.replace(/\s+/g, "").length };
});
await b.close();

if (BROKEN) {
  // على المعطوب: النتيجة الفارغة بلا رسالة (emptyMsg=false) رغم استدعاء الاستعلام
  if (!res.emptyMsg && res.afterSubmit.activity_log >= 1) { console.log("✅ (--broken) G-ITEM-HISTORY مسك العطل: نتيجة فارغة بلا رسالة صريحة."); process.exit(0); }
  console.error("✗ (--broken) لم يُرصَد الغياب — لا أسنان. " + JSON.stringify(res)); process.exit(1);
}
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (res.atLoad.activity_log !== 0 || res.atLoad.sales_movements !== 0) fails.push(`① استعلام عند التحميل: ${JSON.stringify(res.atLoad)} (يجب 0/0)`);
if (res.afterSubmit.activity_log < 1) fails.push("② الضغط لم يستعلم activity_log");
if (res.afterSubmit.sales_movements < 1) fails.push("② الضغط لم يستعلم sales_movements");
if (!res.emptyMsg) fails.push("③ النتيجة الفارغة بلا رسالة صريحة");
if (!res.hasState) fails.push("سطر حالة الصنف غائب");
if (!res.hasDisclaimer) fails.push("بيان «ما لا يشمله الخطّ» غائب");
if (!res.viewerNote) fails.push("④ بيان الحجب عن viewer غائب عند حجب sales_movements");
if (fails.length) { console.error("✗ G-ITEM-HISTORY:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-ITEM-HISTORY: صفر استعلام عند التحميل · الضغط يستعلم الجدولين · الفارغة برسالة · بيان دائم · حجب viewer معلن.");
