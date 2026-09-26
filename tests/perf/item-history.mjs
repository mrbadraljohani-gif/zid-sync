// ============================================================================
// G-ITEM-HISTORY — «حركة الصنف» (البحث الثالث، عرض-فقط) بالقيمة لا الشكل:
//   ① 🚫 صفر استعلام قاعدة عند التحميل · ② الضغط ⇒ استعلام الجدولين.
//   ③ قسمان: «قرارات الأداة» ＋ «حركة المخزون (للسياق)» (details).
//   ④ 🚫 لا قسم أوّل فارغ بلا تفسير (مربوط⇒رسالة · غير مربوط⇒بيان).
//   ⑤ «آخر موقع» مشتقّ من أحدث حدث موقعيّ · viewer⇒«غير معروف».
//   ⑥ viewer محجوب ⇒ بيان داخل الثانويّ · ⑦ لا رقم بمنزلتين عشريّتين+.
//   ⑧ القسم الأوّل بلا أحداث ⇒ الثانويّ يُفتح تلقائياً (open) · ممتلئ ⇒ مطويّ.
//   ⑨ الأحداث المتطابقة المتتالية مجمّعة «×N» (لا مكرّرة N مرّة).
//   ⑩ عدّادا الرأس منفصلان لفظاً: «أصناف مطابقة» (بحث) · «حدث للصنف» (المختار).
// --broken: يحذف ` open` التلقائيّ ⇒ بطاقة تبدو فارغة وأحداثها تحت الطيّة ⇒ يرسب (⑧).
// --broken-expl: يُفرّغ فرع «مربوط بلا قرارات» ⇒ قسم فارغ بلا تفسير ⇒ يرسب (④).
// --broken-group: يلغي التجميع ⇒ الأحداث مكرّرة N مرّة ⇒ يرسب (⑨).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MODE = process.argv.includes("--broken") ? "open" : process.argv.includes("--broken-expl") ? "expl" : process.argv.includes("--broken-group") ? "group" : "";
const BROKEN = !!MODE;
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (MODE === "open") {
  const A = 'const autoOpen = primEvents.length === 0 ? " open" : "";';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد الفتح التلقائيّ"); process.exit(2); }
  html = html.replace(A, 'const autoOpen = "";');   // لا فتح تلقائيّ ⇒ الثانويّ مطويّ ولو الأوّل فارغ
} else if (MODE === "expl") {
  const A = 'else if (linked) primBody += `<div class="q-empty">هذا الصنف مربوط، لكن لم تُسجَّل الأداة أي قرار فيه بعد ${IH_LOG_SINCE}.</div>`;';
  if (!html.includes(A)) { console.error("✗ (--broken-expl) لم أجد فرع «مربوط بلا قرارات»"); process.exit(2); }
  html = html.replace(A, 'else if (linked) primBody += "";');
} else if (MODE === "group") {
  const A = 'const g = ihGroupConsecutive(primEvents, r => { const d = r.details || {}; return `${r.event_type}|${d.before}|${d.after}|${d.reason || ""}|${d.code || ""}|${d.role || ""}`; });';
  if (!html.includes(A)) { console.error("✗ (--broken-group) لم أجد تجميع القسم الأوّل"); process.exit(2); }
  html = html.replace(A, 'const g = primEvents.map(r => ({ item: r, count: 1 }));');   // بلا تجميع ⇒ تكرار
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(async () => {
  const counts = { activity_log: 0, sales_movements: 0 };
  const isoAgo = ms => new Date(Date.now() - ms).toISOString();
  const chain = (data) => { const o = { select: () => o, eq: () => o, order: () => o, range: async () => ({ data, error: null }) }; return o; };
  const mkSb = (acts, movs, movBlocked) => ({ from: (t) => { if (t in counts) counts[t]++; if (t === "sales_movements" && movBlocked) return { select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: "RLS" } }) }) }) }) }; return chain(t === "activity_log" ? (acts || []) : (movs || [])); } });

  dbOnline = true; invBranches = [{ id: "az", name: "العزيزية" }]; famIndex = null; zidIndexCache = null;
  authSession = { user: { id: "u1", email: "o@x.sa" } };
  salesAllLocs = () => [{ id: "az", name: "العزيزية" }];
  stData = { header: ["sku", "name_ar", "price", "quantity", "published", "barcode"],
             rows: [["sku", "name_ar", "price", "quantity", "published", "barcode"], ["Z1", "كرسي اختبار", 100, 5, "Yes", "B1"]] };

  // A) مربوط + 3 أحداث republished متطابقة متتالية + بلا حركة ⇒ تجميع ×3 · الثانويّ مطويّ
  const rep = ts => ({ event_type: "republished", zid_sku: "Z1", details: { before: "غير منشور", after: "منشور" }, created_by: "u1", created_at: isoAgo(ts) });
  manualMap = { "Z1": "W100" };
  sb = mkSb([rep(1e4), rep(2e4), rep(3e4)], []);
  const atLoad = { ...counts };                                   // ① قبل الضغط
  document.getElementById("ihQuery").value = "Z1";
  runItemHistory(); await new Promise(r => setTimeout(r, 70));
  const afterSubmit = { ...counts };                              // ②
  let box = document.getElementById("ihResults");
  const primEvA = box.querySelectorAll(".ih-sec-primary .ih-ev").length;   // ⑨ يجب 1 (مجمّع)
  const hasX3 = box.textContent.includes("×3");
  const detA = box.querySelector("details.ih-more");
  const collapsedWhenFull = detA && !detA.hasAttribute("open");   // ⑧ ممتلئ ⇒ مطويّ
  const cntA = (document.getElementById("ihQCount") || {}).textContent || "";
  const hasPrimary = box.textContent.includes("قرارات الأداة");
  const hasSecondary = !!detA && box.textContent.includes("حركة المخزون");
  const hasDisclaimer = box.textContent.includes("ما قبل التفعيل غير مسجَّل");

  // B) غير مربوط + بلا قرارات + حركتان (period كسريّ) ⇒ بيان + الثانويّ يُفتح تلقائياً + آخر موقع مشتقّ
  manualMap = {};
  sb = mkSb([], [
    { sku: "Z1", location: "az", captured_at: isoAgo(9e7), period_days: 1.2839754050925927, qty_before: 10, qty_after: 6, delta: -4, kind: "estimated_sale" },
    { sku: "Z1", location: "az", captured_at: isoAgo(1.8e8), period_days: 2, qty_before: 6, qty_after: 10, delta: 4, kind: "purchase" },
  ]);
  runItemHistory(); await new Promise(r => setTimeout(r, 70));
  box = document.getElementById("ihResults");
  const detB = box.querySelector("details.ih-more");
  const autoOpenWhenEmpty = detB && detB.hasAttribute("open");    // ⑧
  const unlinkedBanner = box.textContent.includes("غير مربوط بمنتج زد");
  const movVisible = !!box.querySelector("details.ih-more .ih-ev");
  const purchaseShown = box.textContent.includes("استلام");        // ب-٢ الزيادة معروضة
  const lastLocOk = box.textContent.includes("العزيزية") && !box.textContent.includes("بحث في المخزن");   // ⑤
  const noRawDecimal = (box.textContent.match(/\d+\.\d{2,}/g) || []).length === 0;   // ⑦

  // C) مربوط بلا قرارات ⇒ رسالة تفسير (④)
  manualMap = { "Z1": "W100" };
  sb = mkSb([], []);
  runItemHistory(); await new Promise(r => setTimeout(r, 70));
  const linkedEmptyMsg = document.getElementById("ihResults").textContent.includes("مربوط، لكن لم تُسجَّل");

  // D) viewer محجوب ⇒ بيان + آخر موقع «غير معروف» (⑥)
  counts.activity_log = 0; counts.sales_movements = 0; sb = mkSb([], [], true);
  runItemHistory(); await new Promise(r => setTimeout(r, 70));
  const vt = document.getElementById("ihResults").textContent;
  const viewerNote = vt.includes("محجوبة عن دورك"); const lastLocUnknown = vt.includes("غير معروف");

  return { atLoad, afterSubmit, primEvA, hasX3, collapsedWhenFull, cntA, hasPrimary, hasSecondary, hasDisclaimer,
           autoOpenWhenEmpty, unlinkedBanner, movVisible, purchaseShown, lastLocOk, noRawDecimal, linkedEmptyMsg, viewerNote, lastLocUnknown };
});
await b.close();

if (BROKEN) {
  if (MODE === "open" && !res.autoOpenWhenEmpty) { console.log("✅ (--broken) G-ITEM-HISTORY مسك العطل: القسم الأوّل فارغ والثانويّ مطويّ ⇒ بطاقة تبدو خالية وفيها بيانات."); process.exit(0); }
  if (MODE === "expl" && !res.linkedEmptyMsg) { console.log("✅ (--broken-expl) G-ITEM-HISTORY مسك العطل: قسم «قرارات الأداة» فارغ بلا تفسير."); process.exit(0); }
  if (MODE === "group" && res.primEvA !== 1) { console.log(`✅ (--broken-group) G-ITEM-HISTORY مسك العطل: الأحداث المتطابقة مكرّرة (${res.primEvA}) لا مجمّعة.`); process.exit(0); }
  console.error("✗ (" + MODE + ") لم يُرصَد العطل — لا أسنان. " + JSON.stringify(res)); process.exit(1);
}
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (res.atLoad.activity_log !== 0 || res.atLoad.sales_movements !== 0) fails.push(`① استعلام عند التحميل: ${JSON.stringify(res.atLoad)}`);
if (res.afterSubmit.activity_log < 1 || res.afterSubmit.sales_movements < 1) fails.push(`② الضغط لم يستعلم الجدولين: ${JSON.stringify(res.afterSubmit)}`);
if (!res.hasPrimary) fails.push("③ القسم الأوّل «قرارات الأداة» غائب");
if (!res.hasSecondary) fails.push("③ القسم الثانويّ «حركة المخزون» غائب");
if (!res.hasDisclaimer) fails.push("بيان «ما لا يشمله الخطّ» غائب");
if (res.primEvA !== 1) fails.push(`⑨ الأحداث المتطابقة المتتالية غير مجمّعة (عناصر=${res.primEvA}، يجب 1)`);
if (!res.hasX3) fails.push("⑨ شارة «×3» غائبة عن الحدث المجمّع");
if (!res.collapsedWhenFull) fails.push("⑧ القسم الثانويّ مفتوح رغم امتلاء الأوّل (يجب أن يبقى مطوياً)");
if (!res.autoOpenWhenEmpty) fails.push("⑧ القسم الثانويّ لم يُفتح تلقائياً رغم فراغ الأوّل");
if (!res.unlinkedBanner) fails.push("④ بيان «غير مربوط بمنتج زد» غائب");
if (!res.linkedEmptyMsg) fails.push("④ رسالة «مربوط بلا قرارات» غائبة");
if (!res.movVisible) fails.push("ب-١ حركة المخزون غير ظاهرة");
if (!res.purchaseShown) fails.push("ب-٢ الزيادة (استلام/purchase) غير معروضة في الخطّ");
if (!res.lastLocOk) fails.push("⑤ «آخر موقع» لا يطابق أحدث حدث موقعيّ");
if (!res.noRawDecimal) fails.push("⑦ رقم بأكثر من منزلة عشرية واحدة ظهر");
if (!res.viewerNote) fails.push("⑥ بيان الحجب عن viewer غائب");
if (!res.lastLocUnknown) fails.push("⑥ آخر موقع ليس «غير معروف» عند الحجب");
if (!/حدث للصنف/.test(res.cntA)) fails.push(`⑩ عدّاد الصنف المختار لا يقول «حدث للصنف»: «${res.cntA}»`);
if (!html.includes("أصناف مطابقة")) fails.push("⑩ عدّاد البحث «أصناف مطابقة» غائب عن الكود");
if (fails.length) { console.error("✗ G-ITEM-HISTORY:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-ITEM-HISTORY: صفر استعلام عند التحميل · قسمان · فتح تلقائيّ عند فراغ الأوّل · تجميع ×N · الفراغ مُفسَّر · آخر موقع مشتقّ · الزيادة معروضة · لا عشريّ خام · عدّادان منفصلان · حجب viewer.");
