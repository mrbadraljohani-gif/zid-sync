// ============================================================================
// G-SINGLEPOINT — موقع بنقطة واحدة وقيمة>0 له علامة مرئيّة في الرسم (القيمة، لا الشكل):
//   المستودع نقطة واحدة (خطّ polyline بلا طول) لكنه بقيمة في الجدول ⇒ يجب أن تظهر له علامة
//   بارزة (هالة r=6 ＋ قرص r=4) — لا يختفي بصمت.
// --broken: يُلغي فرع solo ⇒ النقطة المنفردة تعود قرصاً دقيقاً r=2.4 بلا علامة بارزة ⇒ يرسب.
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
  const A = "const solo = s.length === 1;";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد كشف النقطة المنفردة solo"); process.exit(2); }
  html = html.replace(A, "const solo = false;");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }]; salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  const d22 = "2026-09-22T12:00:00Z", d23 = "2026-09-23T12:00:00Z";   // business: 09-21, 09-22
  const mk = (loc, sku, up, cap) => ({ kind: "estimated_sale", delta: -3, value_est: 19680, unit_price_incl: 100, unit_price_excl: 87, location: loc, sku, sku_name: sku, upload_id: up, captured_at: cap, period_days: 1 });
  // العزيزية (فرع): نقطة واحدة (09-22) بقيمة كبيرة. الخضرة (فرع): نقطتان (09-21, 09-22)
  const movs = [mk("az", "W1", "UW", d23), mk("kh", "A1", "UA1", d22), mk("kh", "A2", "UA2", d23)];
  const stock = [{ location: "az", sku: "W1", name: "W1", qty: 40, price_incl: 100 }, { location: "kh", sku: "A1", name: "A1", qty: 20, price_incl: 100 }];
  db.sales = { uploads: async () => [{ id: "UW", location: "az", captured_at: d23, suspect: false }, { id: "UA1", location: "kh", captured_at: d22, suspect: false }, { id: "UA2", location: "kh", captured_at: d23, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const svg = document.getElementById("salesChart").innerHTML;
  const soloMarkers = (svg.match(/r="6"/g) || []).length;   // هالة النقطة المنفردة
  // قيمة الفرع صاحب النقطة المنفردة في جدول المقارنة > 0
  const cmp = document.getElementById("salesCmp");
  const whRow = [...cmp.querySelectorAll("tbody tr")].map(tr => (tr.textContent || "").replace(/\s+/g, " ")).find(t => /العزيزية/.test(t)) || "";
  const whHasValue = /19,?680/.test(whRow);
  const titles = [...document.querySelectorAll("#salesChart svg title")].map(t => t.textContent);
  const whInChart = titles.some(t => /العزيزية/.test(t));
  return { soloMarkers, whHasValue, whInChart };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  if (!res.whHasValue) fails.push("المستودع بلا قيمة في الجدول — التجهيزة خاطئة");
  if (res.soloMarkers < 1) fails.push("لا علامة بارزة (r=6) لنقطة منفردة — الموقع يختفي من الرسم");
  if (!res.whInChart) fails.push("المستودع غائب عن عناوين الرسم (لا نقطة له)");
}
if (BROKEN) {
  if (fails.length || res.soloMarkers === 0) { console.log("✅ (--broken) G-SINGLEPOINT مسك العطل: لا علامة بارزة للنقطة المنفردة (تختفي)"); process.exit(0); }
  console.error("✗ (--broken) بقيت العلامة البارزة — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-SINGLEPOINT:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SINGLEPOINT: موقع بنقطة واحدة وقيمة>0 له علامة بارزة مرئيّة في الرسم (لا يختفي).");
