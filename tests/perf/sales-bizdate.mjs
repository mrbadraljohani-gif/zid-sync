// ============================================================================
// G-BIZDATE — كل عرض تجاريّ يستعمل business_date (اليوم السابق للرفعة) لا يوم الرفعة (القيمة، لا الشكل):
//   رفعة captured=2026-09-23 (ظهراً بالرياض) ⇒ نقطة الرسم على business_date 2026-09-22 ·
//   وعضويّة الفلتر تُنسَب لـ09-22 (لا 09-23). الحركات المخزَّنة لا تُمَسّ (اشتقاق عرض).
// --broken: salesSeries يفهرس بيوم الرفعة (slice على captured) ⇒ النقطة على 09-23 ⇒ يرسب.
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
  const A = "const d = salesBizDate(m.captured_at); if (!d) continue;";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد فهرسة salesSeries بيوم العمل"); process.exit(2); }
  html = html.replace(A, "const d = String(m.captured_at).slice(0, 10); if (!d) continue;");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = []; salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  const cap = "2026-09-23T12:00:00Z";   // ظهر 23 بالرياض ⇒ business_date = 09-22
  const movs = [{ kind: "estimated_sale", delta: -5, value_est: 500, unit_price_incl: 100, unit_price_excl: 87, location: "wh", sku: "A1", sku_name: "صنف", upload_id: "U1", captured_at: cap, period_days: 1 }];
  const stock = [{ location: "wh", sku: "A1", name: "صنف", qty: 40, price_incl: 100 }];
  const movsSnapshot = JSON.stringify(movs);   // لإثبات عدم المساس
  db.sales = { uploads: async () => [{ id: "U1", location: "wh", captured_at: cap, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  // نقرأ السلسلة مباشرةً من المحرّك (القيمة لا رسم SVG)
  const series = salesSeries(movs);
  const chartTitle = (document.querySelector("#salesChart svg title") || {}).textContent || "";
  return { seriesDate: series.length ? series[0].d : "", chartTitle, untouched: JSON.stringify(movs) === movsSnapshot };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  if (res.seriesDate !== "2026-09-22") fails.push(`نقطة الرسم على يوم الرفعة لا يوم العمل: توقّعت 2026-09-22، وجدت «${res.seriesDate}»`);
  if (!res.untouched) fails.push("الحركات المخزَّنة تغيّرت — الاشتقاق ليس عرضاً بحتاً");
}
if (BROKEN) {
  if (fails.length || res.seriesDate === "2026-09-23") { console.log("✅ (--broken) G-BIZDATE مسك العطل: النقطة على يوم الرفعة 2026-09-23 بدل يوم العمل 09-22"); process.exit(0); }
  console.error("✗ (--broken) لم تنتقل النقطة ليوم الرفعة — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-BIZDATE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-BIZDATE: نقطة الرسم على business_date (اليوم السابق للرفعة) · الحركات المخزَّنة سليمة (عرض بحت).");
