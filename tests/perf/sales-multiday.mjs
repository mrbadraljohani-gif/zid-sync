// ============================================================================
// G-MULTIDAY — حركة تغطّي أكثر من يوم: نقطة واحدة موسومة بالنطاق (لا عدد، لا تقسيم) (القيمة، لا الشكل):
//   period_days=2 منتهية بيوم عمل 09-23 ⇒ نقطة **واحدة** (span=2) بعنوان «تغطّي 22–23 سبتمبر».
//   لا تُقسَّم إلى نقطتين ولا تُوزَّع الكمية.
// --broken: salesSeries لا يمرّر span (يثبّته 1) ⇒ لا وسم نطاق/لا تمييز ⇒ يرسب.
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
  const A = "const pd = Number(m.period_days) || 1; if (pd > e.span) e.span = pd; byDay.set(d, e);";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد تتبّع span في salesSeries"); process.exit(2); }
  html = html.replace(A, "byDay.set(d, e);");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "br", name: "فرع" }]; salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  const cap = "2026-09-24T12:00:00Z";   // ظهر 24 بالرياض ⇒ business_date = 09-23 · period_days=2 ⇒ يغطّي 09-22..09-23
  const movs = [{ kind: "estimated_sale", delta: -8, value_est: 800, unit_price_incl: 100, unit_price_excl: 87, location: "br", sku: "A1", sku_name: "صنف", upload_id: "U1", captured_at: cap, period_days: 2 }];
  const stock = [{ location: "br", sku: "A1", name: "صنف", qty: 40, price_incl: 100 }];
  db.sales = { uploads: async () => [{ id: "U1", location: "br", captured_at: cap, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const series = salesSeries(movs);
  const svg = document.getElementById("salesChart").innerHTML;
  const titles = [...document.querySelectorAll("#salesChart svg title")].map(t => t.textContent);
  const rangeLbl = bizRangeLabel("2026-09-23", 2);
  return { pts: series.length, span: series.length ? series[0].span : null, titles, rangeLbl, svg };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  if (res.pts !== 1) fails.push(`الحركة قُسّمت: توقّعت نقطة واحدة، وجدت ${res.pts}`);
  if (res.span !== 2) fails.push(`النطاق غير متتبَّع: توقّعت span=2، وجدت ${res.span}`);
  if (res.rangeLbl !== "22–23 سبتمبر") fails.push(`وسم النطاق ليس «22–23 سبتمبر»: «${res.rangeLbl}»`);
  if (!res.titles.some(t => /تغطّي/.test(t) && /22.*23|23.*22/.test(t))) fails.push(`عنوان النقطة بلا نطاق «تغطّي 22–23»: ${JSON.stringify(res.titles)}`);
}
if (BROKEN) {
  if (fails.length || res.span !== 2) { console.log("✅ (--broken) G-MULTIDAY مسك العطل: النطاق غير متتبَّع (span=" + res.span + ") فلا وسم/تمييز"); process.exit(0); }
  console.error("✗ (--broken) بقي span متتبَّعاً — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-MULTIDAY:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-MULTIDAY: نقطة واحدة موسومة بالنطاق «22–23 سبتمبر» (لا تقسيم ولا عدد مجرّد).");
