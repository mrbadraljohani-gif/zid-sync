// ============================================================================
// G-WH-SECTION — قسم المستودع: سحب لا بيع (القيمة، لا الشكل):
//   فلتر «المستودع» ⇒ يعرض «أكثر 10 أصناف سحباً» ＋ «إجمالي الأصناف في المستودع» ＋ قيمة المخزون،
//   ويُخفي مؤشّرات/جدول/رسم المبيعات. 🚫 بلا «متوسط أيام التغطية» ولا «مخاطر النفاد» ولا «راكد» بمعنى البيع.
// --broken: renderWarehouseSection يُخفي القسم دائماً ⇒ لا «أكثر سحباً» ⇒ يرسب.
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
  const A = 'function renderWarehouseSection(whData, movs, curSince) {';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد renderWarehouseSection"); process.exit(2); }
  html = html.replace(A, 'function renderWarehouseSection(whData, movs, curSince) { whData = null;   // (--broken) إخفاء القسم');
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }]; salesPeriod = "all"; salesLoc = "wh"; salesTab = "all"; salesSearch = "";   // فلتر المستودع
  const now = new Date().toISOString();
  const movs = [
    { kind: "estimated_sale", delta: -12, value_est: 4800, unit_price_incl: 400, unit_price_excl: 348, location: "wh", sku: "W1", sku_name: "صنف مسحوب", upload_id: "UW", captured_at: now, period_days: 5 },
    { kind: "estimated_sale", delta: -7, value_est: 700, unit_price_incl: 100, unit_price_excl: 87, location: "wh", sku: "W2", sku_name: "صنف آخر", upload_id: "UW", captured_at: now, period_days: 5 },
  ];
  const stock = [{ location: "wh", sku: "W1", name: "صنف مسحوب", qty: 50, price_incl: 400, price_excl: 348 }, { location: "wh", sku: "W2", name: "صنف آخر", qty: 30, price_incl: 100, price_excl: 87 }, { location: "wh", sku: "W3", name: "ثالث", qty: 10, price_incl: 50, price_excl: 43 }];
  db.sales = { uploads: async () => [{ id: "UW", location: "wh", captured_at: now, suspect: false }], movements: async (loc) => loc === "all" ? movs : movs.filter(m => m.location === loc), clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const rr = document.getElementById("result"); if (rr) rr.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const wh = document.getElementById("salesWhSection");
  const whShown = wh.style.display !== "none";
  const whTxt = (wh.textContent || "").replace(/\s+/g, " ");
  const hasSuhb = /أكثر 10 أصناف سحباً/.test(whTxt);
  const hasTotal = /إجمالي الأصناف في المستودع/.test(whTxt);
  const topName = (wh.querySelector("table tbody tr td.nm") || {}).textContent || "";   // أعلى سحباً (W1، قيمة 4800)
  const totalItemsNum = (() => { const m = whTxt.match(/(\d+)\s*صنف\s*إجمالي الأصناف/); return m ? m[1] : ""; })();
  // المبيعات مخفيّة
  const midHidden = document.querySelector("#page-sales .s4-mid").style.display === "none";
  const detailHidden = document.getElementById("salesDetail").style.display === "none";
  // 🚫 لا تغطية/نفاد/راكد بمعنى البيع في القسم
  const noCoverage = !/متوسط أيام التغطية|مخاطر النفاد|أكثر 10 منتجات راكدة/.test(whTxt);
  return { whShown, hasSuhb, hasTotal, topName, totalItemsNum, midHidden, detailHidden, noCoverage };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  if (!res.whShown) fails.push("قسم المستودع لا يظهر في فلتر «المستودع»");
  if (!res.hasSuhb) fails.push("لا جدول «أكثر 10 أصناف سحباً»");
  if (!res.hasTotal) fails.push("لا «إجمالي الأصناف في المستودع»");
  if (res.totalItemsNum !== "3") fails.push(`«إجمالي الأصناف» ليس 3 (كل مخزون المستودع): «${res.totalItemsNum}»`);
  if (!/صنف مسحوب/.test(res.topName)) fails.push(`أعلى سحباً ليس «صنف مسحوب» (الأعلى قيمة 4800): «${res.topName}»`);
  if (!res.midHidden) fails.push("جدول/رسم المبيعات لم يُخفَ في عرض المستودع");
  if (!res.detailHidden) fails.push("تفصيل المبيعات لم يُخفَ في عرض المستودع");
  if (!res.noCoverage) fails.push("القسم يحوي تغطية/نفاد/راكد (بمعنى البيع) — ممنوع");
}
if (BROKEN) {
  if (fails.length || !res.hasSuhb) { console.log("✅ (--broken) G-WH-SECTION مسك العطل: قسم المستودع مخفيّ فلا «أكثر سحباً»"); process.exit(0); }
  console.error("✗ (--broken) بقي القسم ظاهراً — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-WH-SECTION:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-WH-SECTION: «أكثر سحباً» (أعلى=صنف مسحوب) · «إجمالي الأصناف»=3 · المبيعات مخفيّة · بلا تغطية/نفاد/راكد.");
