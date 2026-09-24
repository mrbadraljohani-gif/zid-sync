// ============================================================================
// G-SALES-QUERY — استعلام عن منتج في شاشة المبيعات (القيمة، لا الشكل):
//   ① الكود ⇒ الصنف يظهر في موقعه بكميته · المواقع الخالية «غير موجود» (لا صفر).
//   ② القيم من price_incl/price_excl مباشرةً (🚫 لا قسمة على 1.15).
//   ③ صنف غير موجود ⇒ رسالة واضحة (لا جدول فارغ ولا خطأ كونسول).
//   ④ صفّ الإجمالي = مجموع الكميات عبر المواقع.
// --broken: يقسم السعر على 1.15 عند العرض ⇒ السعر ≠ المخزَّن ⇒ يرسب.
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
  const A = 'const money = (x, why) => x != null ? salesNum(x) + " ر.س"';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد سطر عرض السعر"); process.exit(2); }
  html = html.replace(A, 'const money = (x, why) => x != null ? salesNum(x / 1.15) + " ر.س"');   // قسمة خاطئة على 1.15
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
  salesPeriod = "all"; salesLoc = "all"; salesTab = "all";
  const now = new Date().toISOString();
  const movs = [{ kind: "estimated_sale", delta: -14, value_est: 2800, unit_price_incl: 200, unit_price_excl: 174, location: "kh", sku: "450822", sku_name: "الفروة", upload_id: "U_kh", captured_at: now, period_days: 5 }];
  const stock = [{ location: "kh", sku: "450822", name: "الفروة", qty: 14, price_incl: 200, price_excl: 174, barcode: "628123" }, { location: "az", sku: "OTHER", name: "غيره", qty: 5, price_incl: 50, price_excl: 43, barcode: "1" }];
  const ups = [{ id: "U_kh", location: "kh", captured_at: now, suspect: false }, { id: "U_az", location: "az", captured_at: now, suspect: false }];
  db.sales = { uploads: async () => ups, movements: async (loc) => loc === "all" ? movs : movs.filter(m => m.location === loc), clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const rr = document.getElementById("result"); if (rr) rr.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  salesQueryRun("450822");
  const box = document.getElementById("sqResults");
  const txt = (box.textContent || "").replace(/\s+/g, " ");
  const rowTxt = (nameRe) => { const tr = [...box.querySelectorAll("table tbody tr")].find(t => nameRe.test(t.textContent)); return tr ? (tr.textContent || "").replace(/\s+/g, " ").trim() : ""; };
  const khRow = rowTxt(/الخضرة/), whRow = rowTxt(/المستودع/), mafRow = rowTxt(/الحراج مفروشات/);
  const totalRow = rowTxt(/الإجمالي/);
  // صنف غير موجود
  salesQueryRun("لا_يوجد_هذا_الصنف_أبداً");
  const noneTxt = (document.getElementById("sqResults").textContent || "");
  return { khRow, whRow, mafRow, totalRow, khHasQty: /14/.test(khRow), khHasPrice: /200/.test(khRow), whMissing: /غير موجود/.test(whRow), mafMissing: /غير موجود/.test(mafRow), noneMsg: /لا يوجد صنف/.test(noneTxt) };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء كونسول: " + errs.join(" | "));
if (BROKEN) {
  // القسمة على 1.15 ⇒ 200 لم تعد تظهر (صارت ~174)
  if (!/200/.test(res.khRow)) { console.log("✅ (--broken) G-SALES-QUERY مسك القسمة على 1.15: السعر لم يعد 200 («" + res.khRow + "»)."); process.exit(0); }
  console.error("✗ (--broken) السعر بقي 200 — لا أسنان."); process.exit(1);
}
if (!res.khHasQty) fails.push(`الخضرة بلا الكمية 14: «${res.khRow}»`);
if (!res.khHasPrice) fails.push(`الخضرة بلا السعر 200 (مباشرةً بلا 1.15): «${res.khRow}»`);
if (!res.whMissing) fails.push(`المستودع (لا يحوي الصنف) لا يعرض «غير موجود»: «${res.whRow}»`);
if (!res.mafMissing) fails.push(`الحراج مفروشات لا يعرض «غير موجود»: «${res.mafRow}»`);
if (!/14/.test(res.totalRow)) fails.push(`صفّ الإجمالي بلا مجموع الكميات (14): «${res.totalRow}»`);
if (!res.noneMsg) fails.push("صنف غير موجود لم يعرض رسالة واضحة");
if (fails.length) { console.error("✗ G-SALES-QUERY:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SALES-QUERY: الكود ⇒ الخضرة 14 بسعر 200 · المواقع الخالية «غير موجود» · إجمالي=14 · غير الموجود رسالة · بلا خطأ.");
