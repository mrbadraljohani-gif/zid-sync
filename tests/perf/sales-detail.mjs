// ============================================================================
// G-SALES-DETAIL — النصف السفليّ design-4 (القيمة، لا الشكل):
//   ① تبويب المواقع (جميع + المواقع). ② «الأكثر مبيعاً» يعمل: أعلى صفّ = أعلى قيمة (500).
//   ③ الراكد ＋ مخاطر النفاد **مبوّبان بـ«التاريخ غير كافٍ»** ما دام daysCovered<14 (المرصود: N رفعة · X يوم).
//   ④ البحث يفلتر الجداول (يبقى «الأكثر مبيعاً» يعمل ببيانات رفعتين).
// --broken: يُلغي بوّابة «التاريخ غير كافٍ» (gate=false) ⇒ الراكد يعرض جدولاً بلا رصد كافٍ ⇒ يرسب.
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
  const A = "const gate = daysCov < S4_STAGNANT_MIN_DAYS;";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد بوّابة التاريخ"); process.exit(2); }
  html = html.replace(A, "const gate = false;");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "فرع العزيزية" }];
  salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  const now = new Date().toISOString();
  const movs = [
    { kind: "estimated_sale", delta: -5, value_est: 500, unit_price_incl: 100, location: "az", sku: "A1", sku_name: "طقم مفارش", upload_id: "U", captured_at: now, period_days: 2 },
    { kind: "estimated_sale", delta: -3, value_est: 300, unit_price_incl: 100, location: "az", sku: "B2", sku_name: "مقلاة", upload_id: "U", captured_at: now, period_days: 2 },
    { kind: "purchase", delta: 4, location: "az", sku: "C3", sku_name: "لحاف", upload_id: "U", captured_at: now, period_days: 2 },
  ];
  const stock = [{ location: "az", sku: "A1", name: "طقم مفارش", qty: 40, price_incl: 100, barcode: "6280000000011" }, { location: "az", sku: "B2", name: "مقلاة", qty: 12, price_incl: 80, barcode: null }];   // A1 له باركود · B2 بلا باركود (null)
  db.sales = { uploads: async () => [{ id: "U", location: "az", captured_at: now, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  const blk = document.getElementById("unBlock"); if (blk) blk.style.display = "block";
  currentFilter = "unmatched"; activeCard = "unmatched";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const txt = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const tabCount = document.querySelectorAll("#salesTabs .s4-tab").length;
  const tbls = document.querySelectorAll("#salesDetail .s4-3tables .s4-tbl");
  // «القيمة» حُذف؛ الترتيب بالقيمة يبقى ⇒ أعلى صفّ = A1 (الأعلى قيمة). سعر الوحدة صار آخر عمود.
  const firstSellerName = txt(document.querySelector("#salesDetail .s4-3tables .s4-tbl table tbody tr td.nm"));
  const sellersHdr = txt(document.querySelector("#salesDetail .s4-3tables .s4-tbl table thead tr"));
  const firstSellerUnit = (document.querySelector("#salesDetail .s4-3tables .s4-tbl table tbody tr td.n:last-child bdi") || {}).textContent || "";
  const sortSub = txt(document.querySelector("#salesDetail .s4-3tables .s4-tbl .s4-tbl-sub"));
  const gates = [...document.querySelectorAll("#salesDetail .s4-gate")].map(txt);
  // ④ البحث: المكبّر داخل جدول «الأكثر مبيعاً» — لا مربع مستقلّ
  const oldBox = !!document.querySelector("#salesDetail .s4-search");
  const srchBtn = !!document.querySelector("#salesDetail .s4-3tables .s4-tbl .s4-srch-btn");
  const inpBeforeToggle = !!document.querySelector("#salesDetail .s4-inline-srch input");
  salesToggleSearch();   // النقر على المكبّر ⇒ يظهر الحقل
  const inpAfterToggle = !!document.querySelector("#salesDetail .s4-inline-srch input");
  const rowCount = () => document.querySelectorAll("#salesDetail .s4-3tables .s4-tbl table tbody tr").length;
  const baseRows = rowCount();   // قبل البحث (البائعون: A1, B2)
  onSalesTblSearch("مقلاة");
  const afterSearchRows = rowCount();
  const afterSearchTxt = txt(document.querySelector("#salesDetail .s4-3tables .s4-tbl table tbody tr"));
  // بحث بباركود معلوم (A1) ⇒ صفّ واحد بعينه · B2 (بلا باركود) لا يُطابق
  onSalesTblSearch("6280000000011");
  const bcRows = rowCount(), bcTxt = txt(document.querySelector("#salesDetail .s4-3tables .s4-tbl table tbody tr"));
  // مسح ⇒ العدد كامل · مسافات فقط ⇒ لا فلترة
  onSalesTblSearch(""); const clearedRows = rowCount();
  onSalesTblSearch("   "); const wsRows = rowCount();
  return { tabCount, tblCount: tbls.length, firstSellerName, firstSellerUnit, sellersHdr, sortSub, gates, afterSearchRows, afterSearchTxt, oldBox, srchBtn, inpBeforeToggle, inpAfterToggle, baseRows, bcRows, bcTxt, clearedRows, wsRows };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (res.tabCount < 2) fails.push(`تبويب المواقع: توقّعت ≥2، وجدت ${res.tabCount}`);
if (res.tblCount !== 3) fails.push(`الجداول الثلاثة: وجدت ${res.tblCount}`);
if (!/طقم مفارش/.test(res.firstSellerName)) fails.push(`الترتيب بالقيمة لم يبقَ — أعلى صفّ ليس A1 (الأعلى قيمة): «${res.firstSellerName}»`);
if (!BROKEN) {
  const gated = res.gates.filter(g => /التاريخ غير كافٍ/.test(g));
  if (gated.length !== 2) fails.push(`بوّابة «التاريخ غير كافٍ»: توقّعت 2 (راكد ＋ نفاد)، وجدت ${gated.length}`);
  if (!res.gates.some(g => /المرصود/.test(g) && /رفعة/.test(g))) fails.push("رسالة البوّابة بلا «المرصود: N رفعة · X يوم»");
  if (res.afterSearchRows !== 1 || !/مقلاة/.test(res.afterSearchTxt)) fails.push(`البحث لم يفلتر «الأكثر مبيعاً» إلى «مقلاة» وحدها (صفوف=${res.afterSearchRows})`);
  if (res.oldBox) fails.push("المربع المستقلّ .s4-search ما زال موجوداً (يجب حذفه)");
  if (!res.srchBtn) fails.push("أيقونة المكبّر .s4-srch-btn غير موجودة داخل جدول «الأكثر مبيعاً»");
  if (res.inpBeforeToggle) fails.push("حقل البحث ظاهر قبل النقر على المكبّر (يجب أن يكون منسدلاً)");
  if (!res.inpAfterToggle) fails.push("النقر على المكبّر لم يُظهر حقل البحث");
  if (!/سعر الوحدة/.test(res.sellersHdr)) fails.push("عمود «سعر الوحدة» غير موجود في رأس «الأكثر مبيعاً»");
  if (/القيمة/.test(res.sellersHdr)) fails.push("عمود «القيمة» ما زال في «الأكثر مبيعاً» (يجب حذفه)");
  if (res.firstSellerUnit.replace(/[^\d]/g, "") !== "100") fails.push(`سعر الوحدة (آخر عمود) للأعلى ليس 100: «${res.firstSellerUnit}»`);
  if (!/مرتّب حسب إجمالي قيمة المبيعات/.test(res.sortSub)) fails.push(`سطر أساس الترتيب غائب: «${res.sortSub}»`);
  // البحث بالباركود ＋ القيدان
  if (res.bcRows !== 1 || !/طقم مفارش/.test(res.bcTxt)) fails.push(`البحث بباركود A1 لم يعطِ صفّاً واحداً بعينه (صفوف=${res.bcRows} · «${res.bcTxt}»)`);
  if (res.clearedRows !== res.baseRows) fails.push(`مسح الحقل لم يُعِد العدد كاملاً (${res.clearedRows}≠${res.baseRows})`);
  if (res.wsRows !== res.baseRows) fails.push(`مسافات فقط فلترت (${res.wsRows}≠${res.baseRows}) — يجب ألّا تفلتر`);
}
if (BROKEN) {
  if (fails.length || res.gates.filter(g => /التاريخ غير كافٍ/.test(g)).length < 2) { console.log("✅ (--broken) G-SALES-DETAIL مسك العطل (بلا بوّابة التاريخ)"); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إلغاء البوّابة — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-SALES-DETAIL:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SALES-DETAIL: تبويب ＋ «الأكثر مبيعاً» (الترتيب بالقيمة محفوظ · بلا عمود قيمة) ＋ الراكد/النفاد مبوّبان «التاريخ غير كافٍ» (المرصود رفعة · يوم) ＋ البحث يفلتر.");
