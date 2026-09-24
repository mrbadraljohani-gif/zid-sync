// ============================================================================
// G-SALES-CLEAN — كتل حالة الرفع في أعلى «المخزون» (القيمة/المحتوى، لا الغياب):
//   ① لا كتلة (#salesMissBanner · #salesBanner · #salesDisBox · #salesLastUp) في #page-sales ولا #page-db.
//   ② الكتل داخل #invUploadStatus (#page-inventory) و**مملوءة فعلاً** (محتوى، لا حاوية فارغة).
//   ③ القاعدة المقدّسة ٨ محفوظة في شاشة المبيعات: صفّ الإجمالي في جدول المقارنة يحمل «يشمل N من N فروع».
//   ④ التغطية (معدّل الريال/يوم) حاضرة لـowner · غائبة لـadmin (قرار عرض).
//   ⑤ viewer: الحاوية مخفيّة (RLS يحجب المصادر — لا نصف صامت).
// --broken        : يزيل بوّابة دور التغطية ⇒ تظهر لـadmin ⇒ يرسب على ④.
// --broken-empty  : fillUploadStatus لا يملأ ⇒ الحاوية فارغة (لا «آخر رفعة») ⇒ يرسب على ② (المحتوى لا الغياب).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const BROKEN_EMPTY = process.argv.includes("--broken-empty");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  const A = 'if (covEl) covEl.innerHTML = (myRole === "owner" || myRole === "marketing") ? ';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد بوّابة دور التغطية"); process.exit(2); }
  html = html.replace(A, 'if (covEl) covEl.innerHTML = (true) ? ');
}
if (BROKEN_EMPTY) {
  const A = 'if (typeof renderSalesPage === "function") await renderSalesPage();';
  if (!html.includes(A)) { console.error("✗ (--broken-empty) لم أجد نداء الملء"); process.exit(2); }
  html = html.replace(A, '/* (--broken-empty) لا ملء ⇒ حاوية فارغة */');
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setViewport({ width: 1200, height: 900 });
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; authSession = { user: { email: "u@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
  salesPeriod = "7"; salesLoc = "all"; salesTab = "all";
  const day = 86400000, now = Date.now(), iso = t => new Date(t).toISOString();
  const azCur = iso(now - 1 * day), khOld = iso(now - 9 * day);
  const movs = [
    { kind: "estimated_sale", delta: -6, value_est: 600, unit_price_incl: 100, unit_price_excl: 87, location: "az", sku: "A1", sku_name: "صنف", upload_id: "UAZ", captured_at: azCur, period_days: 1 },
    { kind: "estimated_sale", delta: -10, value_est: 1000, unit_price_incl: 100, unit_price_excl: 87, location: "kh", sku: "W1", sku_name: "صنف2", upload_id: "UKH", captured_at: khOld, period_days: 1 },
    { kind: "disappeared", delta: -3, value_est: 300, location: "az", sku: "GONE", sku_name: "مفقود", upload_id: "UAZ", captured_at: azCur, period_days: 1 },
  ];
  const stock = [{ location: "az", sku: "A1", name: "صنف", qty: 30, price_incl: 100, price_excl: 87 }, { location: "kh", sku: "W1", name: "صنف2", qty: 50, price_incl: 100, price_excl: 87 }];
  db.sales = { uploads: async () => [{ id: "UAZ", location: "az", captured_at: azCur, suspect: false }, { id: "UKH", location: "kh", captured_at: khOld, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
  sb = { rpc: async () => ({ data: [{ used: 0, cap: 500 }], error: null }), from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  const ids = ["salesMissBanner", "salesBanner", "salesDisBox", "salesLastUp"];
  const snap = async (role) => {
    myRole = role; try { goPage("home"); } catch (e) {}
    document.getElementById("page-inventory").classList.add("active");
    await fillUploadStatus();
    const host = document.getElementById("invUploadStatus");
    return {
      hidden: host.style.display === "none",
      inInv: ids.filter(i => document.querySelector(`#invUploadStatus #${i}`)).length,
      lu: (document.getElementById("salesLastUp") || {}).textContent || "",
      miss: (document.getElementById("salesMissBanner") || {}).textContent || "",
      cov: (document.getElementById("salesCoverage") || {}).textContent || "",
    };
  };
  const owner = await snap("owner");
  // جدول المقارنة (في شاشة المبيعات) — بيان القاعدة ٨
  const totNote = (document.querySelector("#salesCmp tbody tr.total .tot-note") || {}).textContent || "";
  // الكتل ليست في page-sales ولا page-db
  const inSales = ids.filter(i => document.querySelector(`#page-sales #${i}`));
  const inDb = ids.filter(i => document.querySelector(`#page-db #${i}`));
  // فتح تفاصيل المفقود
  if (typeof salesShowDisappeared === "function") await salesShowDisappeared();
  const disHasTable = !!document.querySelector("#salesDisBox table");
  const admin = await snap("admin");
  const viewer = await snap("viewer");
  return { owner, admin, viewer, totNote, inSales, inDb, disHasTable };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const covHas = s => /التغطية/.test(s);
const populated = s => /آخر رفعة/.test(s);
if (BROKEN) {
  if (covHas(res.admin.cov)) { console.log("✅ (--broken) G-SALES-CLEAN مسك تسريب التغطية لـadmin."); process.exit(0); }
  console.error("✗ (--broken) لم تظهر التغطية لـadmin — لا أسنان."); process.exit(1);
}
if (BROKEN_EMPTY) {
  if (!populated(res.owner.lu)) { console.log("✅ (--broken-empty) G-SALES-CLEAN مسك الحاوية الفارغة: لا «آخر رفعة» في #invUploadStatus."); process.exit(0); }
  console.error("✗ (--broken-empty) الحاوية بقيت مملوءة — لا أسنان."); process.exit(1);
}
// ① لا في page-sales/page-db
if (res.inSales.length) fails.push(`① كتل في شاشة المبيعات: ${res.inSales.join(", ")}`);
if (res.inDb.length) fails.push(`① كتل بقيت في صفحة الرفع: ${res.inDb.join(", ")}`);
// ② في المخزون ومملوءة (محتوى)
if (res.owner.inInv !== 4) fails.push(`② الكتل ليست كلها في #invUploadStatus: ${res.owner.inInv}/4`);
if (!populated(res.owner.lu)) fails.push(`② حاوية المخزون فارغة (لا «آخر رفعة») — فحص محتوى: «${res.owner.lu.slice(0, 60)}»`);
if (!res.disHasTable) fails.push("② جدول المفقود لا يفتح (لا table في #salesDisBox)");
// ③ بيان القاعدة ٨ في الشاشة
if (!(/يشمل/.test(res.totNote) && /من/.test(res.totNote))) fails.push(`③ صفّ الإجمالي بلا «يشمل N من N فروع»: «${res.totNote}»`);
// ④ التغطية owner فقط
if (!covHas(res.owner.cov)) fails.push(`④ التغطية غائبة عن owner: «${res.owner.cov}»`);
if (covHas(res.admin.cov)) fails.push(`④ 🚨 التغطية ظهرت لـadmin: «${res.admin.cov}»`);
// ② admin مملوء أيضاً (الكتلتان الأخريان له)
if (!populated(res.admin.lu)) fails.push("② حاوية admin فارغة (يجب أن تُملأ — بلا التغطية)");
// ⑤ viewer مخفيّ
if (!res.viewer.hidden) fails.push("⑤ 🚨 حاوية المخزون ظاهرة لـviewer (RLS يحجب مصادرها — يجب إخفاؤها)");
if (fails.length) { console.error("✗ G-SALES-CLEAN:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SALES-CLEAN: الكتل في #invUploadStatus (المخزون) مملوءةً · خارج الشاشة وصفحة الرفع · «يشمل N من N» في الإجمالي · التغطية owner فقط · viewer مخفيّ.");
