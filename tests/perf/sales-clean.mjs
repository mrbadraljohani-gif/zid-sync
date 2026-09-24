// ============================================================================
// G-SALES-CLEAN (دفعة هـ) — كتل حالة الرفع خرجت من شاشة المبيعات إلى صفحة الرفع (القيمة، لا الشكل):
//   ① لا كتلة من الثلاث (#salesMissBanner · #salesBanner · #salesDisBox · #salesLastUp) داخل #page-sales.
//   ② الثلاث داخل #dbUploadStatus (صفحة الرفع #page-db).
//   ③ القاعدة المقدّسة ٨ محفوظة في الشاشة: صفّ الإجمالي في جدول المقارنة يحمل «يشمل N من N فروع» (حين N<الكل).
//   ④ شريط التغطية (معدّل الريال/يوم) غائب في منظور admin · حاضر في منظور owner (قرار عرض).
// --broken       : يزيل بوّابة الدور عن التغطية ⇒ تظهر لـadmin ⇒ يرسب على ④.
// --broken-sales : يُبقي كتلة (#salesMissBanner) داخل #page-sales ⇒ يرسب على ①.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const BROKEN_SALES = process.argv.includes("--broken-sales");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  const A = 'if (covEl) covEl.innerHTML = (myRole === "owner" || myRole === "marketing") ? ';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد بوّابة دور التغطية"); process.exit(2); }
  html = html.replace(A, 'if (covEl) covEl.innerHTML = (true) ? ');   // التغطية بلا بوّابة ⇒ تظهر لـadmin
}
if (BROKEN_SALES) {
  // كتلة باقية في شاشة المبيعات (نقل ناقص)
  const A = '<!-- كتل حالة الرفع (بلا رفعة · المفقود · آخر رفعة/التغطية) نُقلت إلى صفحة «تحديث قاعدة البيانات» ← #dbUploadStatus (دفعة هـ) -->';
  if (!html.includes(A)) { console.error("✗ (--broken-sales) لم أجد موضع الكتل في الشاشة"); process.exit(2); }
  html = html.replace(A, '<div class="s4-banner miss" id="salesMissBanner" style="display:none"></div>');
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

  // منظور owner: يرسم الشاشة + صفحة الرفع
  myRole = "owner"; try { goPage("home"); } catch (e) {}
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const ids = ["salesMissBanner", "salesBanner", "salesDisBox", "salesLastUp"];
  const inSales = ids.filter(i => document.querySelector(`#page-sales #${i}`));
  const inDb = ids.filter(i => document.querySelector(`#dbUploadStatus #${i}`));
  const totNote = (document.querySelector("#salesCmp tbody tr.total .tot-note") || {}).textContent || "";
  const covOwner = (document.getElementById("salesCoverage") || {}).textContent || "";

  // منظور admin: صفحة الرفع (renderSalesPage عبر goPage('db'))
  myRole = "admin"; await renderSalesPage();
  const covAdmin = (document.getElementById("salesCoverage") || {}).textContent || "";
  return { inSales, inDb, totNote, covOwner, covAdmin };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const covHasRate = s => /التغطية/.test(s);
if (BROKEN) {
  if (covHasRate(res.covAdmin)) { console.log("✅ (--broken) G-SALES-CLEAN مسك تسريب التغطية لـadmin."); process.exit(0); }
  console.error("✗ (--broken) لم تظهر التغطية لـadmin — لا أسنان."); process.exit(1);
}
if (BROKEN_SALES) {
  if (res.inSales.length) { console.log(`✅ (--broken-sales) G-SALES-CLEAN مسك كتلة باقية في الشاشة: ${res.inSales.join(",")}`); process.exit(0); }
  console.error("✗ (--broken-sales) لم تُرصد كتلة في الشاشة — لا أسنان."); process.exit(1);
}
if (res.inSales.length) fails.push(`① كتل حالة الرفع ما زالت في شاشة المبيعات: ${res.inSales.join(", ")}`);
if (res.inDb.length !== 4) fails.push(`② الكتل ليست كلها في #dbUploadStatus: [${res.inDb.join(", ")}]`);
if (!(/يشمل/.test(res.totNote) && /من/.test(res.totNote))) fails.push(`③ صفّ الإجمالي بلا «يشمل N من N فروع»: «${res.totNote}»`);
if (!covHasRate(res.covOwner)) fails.push(`④ التغطية غائبة عن owner: «${res.covOwner}»`);
if (covHasRate(res.covAdmin)) fails.push(`④ 🚨 التغطية ظهرت لـadmin (يجب أن تُخفى): «${res.covAdmin}»`);
if (fails.length) { console.error("✗ G-SALES-CLEAN:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SALES-CLEAN: الكتل الثلاث خارج الشاشة وداخل صفحة الرفع · «يشمل N من N» في صفّ الإجمالي · التغطية owner فقط (لا admin).");
