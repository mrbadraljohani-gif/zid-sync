// ============================================================================
// G-BASELINE — رفعة التأسيس (كل حركاتها kind='new') مستبعَدة من كل مقارنة/عدّ (القيمة، لا الشكل):
//   الفترة السابقة تحوي رفعة تأسيس فقط ⇒ لا نسبة إطلاقاً («—» + «رفعة تأسيس») ·
//   حركات التأسيس لا تُحسب في «متحرّكة» ولا في المبيعات.
// --broken: لا يستبعد التأسيس ⇒ movedPrev يتضخّم برفعة التأسيس ⇒ نسبة «متحرّكة» تظهر (لا «—») ⇒ يرسب.
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
  const A = "const movs = rawMovs.filter(m => !baselineIds.has(m.upload_id));";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد سطر استبعاد التأسيس"); process.exit(2); }
  html = html.replace(A, "const movs = rawMovs;   // (--broken) لا استبعاد للتأسيس");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = []; salesPeriod = "7"; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  const day = 86400000, now = Date.now(), iso = t => new Date(t).toISOString();
  // U0 = تأسيس (كل حركاته new) قبل 9 أيام (داخل نافذة السابقة لـ7 أيام: [−14, −7))
  // U1 = رفعة حاليّة (بيع) قبل 1 يوم
  const baseUp = iso(now - 9 * day), curUp = iso(now - 1 * day);
  const movs = [];
  for (let i = 0; i < 50; i++) movs.push({ kind: "new", delta: 10, location: "wh", sku: "N" + i, sku_name: "تأسيس" + i, upload_id: "U0", captured_at: baseUp, period_days: null });
  movs.push({ kind: "estimated_sale", delta: -5, value_est: 500, unit_price_incl: 100, unit_price_excl: 87, location: "wh", sku: "A1", sku_name: "صنف مبيع", upload_id: "U1", captured_at: curUp, period_days: 1 });
  const stock = [{ location: "wh", sku: "A1", name: "صنف مبيع", qty: 40, price_incl: 100 }];
  db.sales = { uploads: async () => [{ id: "U0", location: "wh", captured_at: baseUp, suspect: false }, { id: "U1", location: "wh", captured_at: curUp, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const txt = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const smoved = document.querySelector('#salesKpis .kpi[data-k="smoved"]');
  const movedVal = txt(smoved && smoved.querySelector("b"));
  const movedTrend = txt(smoved && smoved.querySelector(".kpi-trend"));
  const svalTrend = txt(document.querySelector('#salesKpis .kpi[data-k="sval"] .kpi-trend'));
  return { movedVal, movedTrend, svalTrend };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  // «متحرّكة» الحاليّة = 1 (A1 فقط) — التأسيس مستبعَد
  if (res.movedVal.replace(/[^\d]/g, "") !== "1") fails.push(`«متحرّكة» تشمل التأسيس — توقّعت 1، وجدت «${res.movedVal}»`);
  // السابقة تحوي التأسيس فقط ⇒ لا نسبة، «—» ＋ «رفعة تأسيس» في العنوان
  if (!/—/.test(res.movedTrend)) fails.push(`نسبة «متحرّكة» ظهرت رغم أن السابقة تأسيس فقط: «${res.movedTrend}»`);
  if (!/—/.test(res.svalTrend)) fails.push(`نسبة المبيعات ظهرت رغم أن السابقة تأسيس فقط: «${res.svalTrend}»`);
}
if (BROKEN) {
  if (fails.length || !/%/.test(res.movedTrend)) { console.log("✅ (--broken) G-BASELINE مسك العطل: نسبة «متحرّكة» ظهرت بضمّ رفعة التأسيس (" + (res.movedTrend || res.movedVal) + ")"); process.exit(0); }
  console.error("✗ (--broken) لم يظهر تضخّم/نسبة بعد ضمّ التأسيس — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-BASELINE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-BASELINE: التأسيس مستبعَد من العدّ والمقارنة · الفترة السابقة (تأسيس فقط) ⇒ «—» لا نسبة.");
