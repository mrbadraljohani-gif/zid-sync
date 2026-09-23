// ============================================================================
// G-WH-EXCLUDE — المستودع مخزن لا نقطة بيع (القيمة، لا الشكل):
//   الإجماليّ = مجموع الفرعين تماماً · المستودع لا يظهر في جدول/رسم المبيعات ·
//   أرقام الفرعين لم تتغيّر · قيمة المخزون تشمل الثلاثة (يشمل المستودع).
// تجهيزة: العزيزية 9,772 · الخضرة 26,816 (ثابتان) · المستودع 19,680 (يجب استبعاده من المبيعات).
//   المبيعات = 36,588 (لا 56,268) · قطع = 935 (لا 1,380) · المخزون يشمل الثلاثة.
// --broken: يُعيد المستودع لمواقع المبيعات (salesShown يشمل wh) ⇒ الإجماليّ يتضخّم ⇒ يرسب.
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
  const A = 'const salesShown = isWhView ? [] : (salesLoc === "all" ? branchLocs : [salesLoc]);';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد salesShown"); process.exit(2); }
  html = html.replace(A, 'const salesShown = isWhView ? [] : (salesLoc === "all" ? locsAll : [salesLoc]);   // (--broken) يُعيد المستودع للمبيعات');
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
  const now = new Date().toISOString();
  const mv = (loc, sku, q, v) => ({ kind: "estimated_sale", delta: -q, value_est: v, unit_price_incl: v / q, unit_price_excl: Math.round(v / q / 1.15), location: loc, sku, sku_name: sku, upload_id: "U_" + loc, captured_at: now, period_days: 5 });
  // العزيزية 9,772 (units 500) · الخضرة 26,816 (units 435) · المستودع 19,680 (units 445) — سحب لا بيع
  const movs = [mv("az", "A1", 500, 9772), mv("kh", "K1", 435, 26816), mv("wh", "W1", 445, 19680)];
  const stock = [{ location: "az", sku: "A1", name: "A1", qty: 100, price_incl: 20, price_excl: 17 }, { location: "kh", sku: "K1", name: "K1", qty: 200, price_incl: 30, price_excl: 26 }, { location: "wh", sku: "W1", name: "W1", qty: 1000, price_incl: 500, price_excl: 435 }];
  db.sales = { uploads: async () => [{ id: "U_az", location: "az", captured_at: now, suspect: false }, { id: "U_kh", location: "kh", captured_at: now, suspect: false }, { id: "U_wh", location: "wh", captured_at: now, suspect: false }], movements: async (loc) => loc === "all" ? movs : movs.filter(m => m.location === loc), clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const rr = document.getElementById("result"); if (rr) rr.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const num = el => el ? (el.textContent || "").replace(/[^\d]/g, "") : "";
  const sval = num(document.querySelector('#salesKpis .kpi[data-k="sval"] b'));
  const sunits = num(document.querySelector('#salesKpis .kpi[data-k="sunits"] b'));
  const sinv = num(document.querySelector('#salesKpis .kpi[data-k="sinv"] b'));
  const cmpTxt = (document.getElementById("salesCmp").textContent || "");
  const chartTitles = [...document.querySelectorAll("#salesChart svg title")].map(t => t.textContent).join(" | ");
  const whInCmp = /المستودع/.test(cmpTxt);
  const whInChart = /المستودع/.test(chartTitles);
  const whSectionShown = document.getElementById("salesWhSection").style.display !== "none";
  // أرقام الفرعين منفصلة من صفوفهما
  const rowNum = (nameRe) => { const tr = [...document.querySelectorAll("#salesCmp tbody tr")].find(t => nameRe.test(t.textContent)); if (!tr) return ""; const bdi = tr.querySelector("td.cmp-sales .cmp-front bdi") || tr.querySelector("td.n bdi"); return bdi ? bdi.textContent.replace(/[^\d]/g, "") : ""; };
  return { sval, sunits, sinv, whInCmp, whInChart, whSectionShown, az: rowNum(/العزيزية/), kh: rowNum(/الخضرة/) };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  if (res.sval !== "36588") fails.push(`المبيعات ليست مجموع الفرعين 36,588 (المستودع مستبعَد): «${res.sval}»`);
  if (res.sunits !== "935") fails.push(`قطع بيعت ليست 935 (500+435): «${res.sunits}»`);
  if (res.sinv !== "508000") fails.push(`قيمة المخزون لا تشمل الثلاثة (2000+6000+500000=508,000): «${res.sinv}»`);
  if (res.whInCmp) fails.push("المستودع ظهر في جدول المبيعات");
  if (res.whInChart) fails.push("المستودع ظهر في رسم المبيعات");
  if (!res.whSectionShown) fails.push("قسم المستودع لا يظهر في «الكل»");
  if (res.az !== "9772") fails.push(`رقم العزيزية تغيّر: «${res.az}» (توقّعت 9772)`);
  if (res.kh !== "26816") fails.push(`رقم الخضرة تغيّر: «${res.kh}» (توقّعت 26816)`);
}
if (BROKEN) {
  if (fails.length || res.sval !== "36588" && res.sval !== "") { console.log("✅ (--broken) G-WH-EXCLUDE مسك العطل: المبيعات تضخّمت بالمستودع («" + res.sval + "» ≠ 36588)"); process.exit(0); }
  console.error("✗ (--broken) لم تتضخّم المبيعات — لا أسنان (sval=" + res.sval + ")."); process.exit(1);
}
if (fails.length) { console.error("✗ G-WH-EXCLUDE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-WH-EXCLUDE: المبيعات=36,588 (فرعان) · قطع=935 · مخزون=508,000 (ثلاثة) · المستودع خارج جدول/رسم المبيعات · أرقام الفرعين ثابتة (9,772/26,816).");
