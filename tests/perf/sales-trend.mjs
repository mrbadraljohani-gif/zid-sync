// ============================================================================
// G-TREND — «عن السابق» مطبَّعة معدّلاً يوميّاً لا مجاميعَ (القيمة، لا الشكل):
//   فترتان مختلفتا الطول بنفس المعدّل اليوميّ ⇒ نسبة ≈ 0% (لا انخفاض وهميّ) —
//   لو قورنت المجاميع لظهر انخفاض حادّ. والطولان يظهران بجوار النسبة عند اختلاف >20%.
// --broken: يقارن المجاميع (cur - prev)/prev ⇒ نسبة سالبة كبيرة رغم تساوي المعدّل ⇒ يرسب.
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
  // يكسر التطبيع: يمرّر المجاميع الخام بدل المعدّلات اليوميّة في نداء scope (المبيعات) ⇒ مقارنة مجاميع
  const call = 'salesRateSpan(scope.valRate, prevSince != null ? scope.pvalRate : -1, "kpi-trend", prevBaselineOnly, observedDays, scope.pdaysMax)';
  if (!html.includes(call)) { console.error("✗ (--broken) لم أجد نداء scope.valRate"); process.exit(2); }
  html = html.replace(call, 'salesRateSpan(scope.val, prevSince != null ? sumPrevVal : -1, "kpi-trend", prevBaselineOnly)');
  html = html.replace("const covGate = salesCovInsufficient(observedDays);", "const covGate = salesCovInsufficient(observedDays);\n    const sumPrevVal = dataActive.reduce((s,d)=>s+d.pagg.estValue,0);");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "br", name: "فرع" }]; salesPeriod = "7"; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  const day = 86400000, now = Date.now(), iso = t => new Date(t).toISOString();
  // الحاليّة: يوم واحد، 100 وحدة (معدّل 100/يوم). السابقة: 3 أيام، 300 وحدة (معدّل 100/يوم أيضاً).
  // مطبَّعاً: 0% (لا تغيّر). مجاميعَ: (100-300)/300 = −67% (وهميّ).
  const cur = { kind: "estimated_sale", delta: -100, value_est: 10000, unit_price_incl: 100, unit_price_excl: 87, location: "br", sku: "A1", sku_name: "صنف", upload_id: "UC", captured_at: iso(now - 1 * day), period_days: 1 };
  const prev = { kind: "estimated_sale", delta: -300, value_est: 30000, unit_price_incl: 100, unit_price_excl: 87, location: "br", sku: "A1", sku_name: "صنف", upload_id: "UP", captured_at: iso(now - 10 * day), period_days: 3 };
  const stock = [{ location: "br", sku: "A1", name: "صنف", qty: 40, price_incl: 100 }];
  db.sales = { uploads: async () => [{ id: "UP", location: "br", captured_at: iso(now - 10 * day), suspect: false }, { id: "UC", location: "br", captured_at: iso(now - 1 * day), suspect: false }], movements: async () => [cur, prev], clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const txt = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const svalTrend = txt(document.querySelector('#salesKpis .kpi[data-k="sval"] .kpi-trend'));
  const sunitsTrend = txt(document.querySelector('#salesKpis .kpi[data-k="sunits"] .kpi-trend'));
  return { svalTrend, sunitsTrend };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const pctOf = s => { const m = String(s).match(/-?\d+/); return m ? parseInt(m[0], 10) : null; };
if (!BROKEN) {
  const pv = pctOf(res.svalTrend), pu = pctOf(res.sunitsTrend);
  if (pv == null || Math.abs(pv) > 5) fails.push(`المبيعات: توقّعت ≈0% (معدّل مطبَّع)، وجدت «${res.svalTrend}»`);
  if (pu == null || Math.abs(pu) > 5) fails.push(`الوحدات: توقّعت ≈0% (معدّل مطبَّع)، وجدت «${res.sunitsTrend}»`);
  if (!/يوم/.test(res.svalTrend)) fails.push(`الطولان لم يظهرا رغم اختلاف >20% (1 ← 3 يوم): «${res.svalTrend}»`);
}
if (BROKEN) {
  const pv = pctOf(res.svalTrend);
  if (fails.length || (pv != null && pv < -30)) { console.log("✅ (--broken) G-TREND مسك العطل: مقارنة مجاميع أظهرت انخفاضاً وهمياً «" + res.svalTrend + "»"); process.exit(0); }
  console.error("✗ (--broken) لم يظهر انخفاض وهميّ بمقارنة المجاميع — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-TREND:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-TREND: النسبة مطبَّعة معدّلاً يوميّاً (≈0% لفترتين متساويتَي المعدّل مختلفتَي الطول) ＋ الطولان يظهران.");
