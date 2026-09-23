// ============================================================================
// G-SELLERS-WIDTH — تخطيط جداول المبيعات في العرض الفعليّ (القيمة، لا الشكل):
//   ① خليّة اسم «أكثر مبيعاً» عرضها ≥ 120px في تخطيط سطح المكتب (لا تنضغط لأعمدة كثيرة).
//   ② رؤوس القيمة (المبيعات/قيمة المخزون/سعر الوحدة/القيمة) تحمل وسم «شامل».
//   ③ جدول مقارنة المواقع بلا عمود «التغطية».
// --broken: يُعيد .s4-3tables إلى repeat(3, ...) الضيّق ⇒ الاسم ينضغط <120 ⇒ يرسب.
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
  const A = ".s4-tbl td.nm, .s4-tbl th:nth-child(2) { width: 42%; }";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد hint عرض الاسم"); process.exit(2); }
  html = html.replace(A, "");   // إزالة hint العرض ⇒ auto-layout يخنق الاسم
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setViewport({ width: 1280, height: 1400 });   // تخطيط سطح مكتب حقيقيّ
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }]; salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  const now = new Date().toISOString();
  const nm = ["كرسي ارضي متعدد الاستخدامات موديل فاخر", "بطانيه سوبر سوفت مزدوجة كبيرة", "خضاضة حليب كهربائية خمس سرعات"];
  const movs = nm.map((n, i) => ({ kind: "estimated_sale", delta: -(5 + i), value_est: (5 + i) * 200, unit_price_incl: 200, unit_price_excl: 174, location: "az", sku: "S" + i, sku_name: n, upload_id: "U", captured_at: now, period_days: 20 }));
  const stock = [{ location: "az", sku: "S0", name: nm[0], qty: 100, price_incl: 200, price_excl: 174, barcode: "1" }];
  db.sales = { uploads: async () => [{ id: "U", location: "az", captured_at: now, suspect: false }], movements: async (l) => l === "all" ? movs : movs.filter(m => m.location === l), clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const rr = document.getElementById("result"); if (rr) rr.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const nmCell = document.querySelector("#salesDetail .s4-3tables .s4-tbl table tbody tr td.nm");
  const nmW = nmCell ? Math.round(nmCell.getBoundingClientRect().width) : 0;
  const sellersHdr = (document.querySelector("#salesDetail .s4-3tables .s4-tbl table thead tr") || {}).textContent || "";
  const cmpHdr = (document.querySelector("#salesCmp thead tr") || {}).textContent || "";
  return { nmW, sellersHasIncl: /شامل/.test(sellersHdr), cmpHasIncl: /شامل/.test(cmpHdr), cmpHasCoverage: /التغطية/.test(cmpHdr) };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  if (!(res.nmW >= 120)) fails.push(`خليّة اسم «أكثر مبيعاً» منضغطة: ${res.nmW}px (<120) — الاسم مبتور`);
  if (!res.sellersHasIncl) fails.push("رؤوس «أكثر مبيعاً» بلا وسم «شامل»");
  if (!res.cmpHasIncl) fails.push("رؤوس جدول المقارنة بلا وسم «شامل»");
  if (res.cmpHasCoverage) fails.push("عمود «التغطية» ما زال في جدول المقارنة (يجب حذفه)");
}
if (BROKEN) {
  if (fails.length || !(res.nmW >= 120)) { console.log("✅ (--broken) G-SELLERS-WIDTH مسك العطل: الاسم انضغط إلى " + res.nmW + "px بشبكة 3 أعمدة الضيّقة"); process.exit(0); }
  console.error("✗ (--broken) لم ينضغط الاسم — لا أسنان (nmW=" + res.nmW + ")."); process.exit(1);
}
if (fails.length) { console.error("✗ G-SELLERS-WIDTH:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-SELLERS-WIDTH: اسم «أكثر مبيعاً» ${res.nmW}px (≥120) · رؤوس القيمة «شامل» · جدول المقارنة بلا «التغطية».`);
