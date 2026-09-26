// ============================================================================
// G-TAX-STOCK — «قيمة المخزون قبل الضريبة» من price_excl مباشرةً؛ الصنف بلا excl يُستبعَد ويُعدّ (القيمة):
//   صنفان بـexcl (10×80 + 5×80 = 1200) ＋ صنف بلا excl (qty 7) ⇒ المجموع=1200 (لا صفر للناقص) ＋ عدّاد=1.
//   شامل الضريبة يبقى مجموع الثلاثة بـprice_incl (لا يتأثّر). لا ضرب/قسمة على 1.15.
// --broken: يحسب الصنف بلا excl صفراً بصمت (يُدرجه في المجموع بلا عدّاد) ⇒ لا عدّاد «مستبعدة» ⇒ يرسب.
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
  const A = "if (q != null && pe != null) invValueExcl += q * pe; else if (q != null && pe == null) invExclMissing++;";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد حساب invValueExcl في salesColData"); process.exit(2); }
  html = html.replace(A, "if (q != null) invValueExcl += q * (pe != null ? pe : 0);");   // يحسب الناقص صفراً بلا عدّاد
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
  const now = new Date().toISOString();
  const movs = [{ kind: "estimated_sale", delta: -1, value_est: 100, unit_price_incl: 100, unit_price_excl: 87, location: "br", sku: "A1", sku_name: "صنف", upload_id: "U1", captured_at: now, period_days: 2 }];
  // مخزون: صنفان بـexcl (10×80، 5×80) ＋ صنف بلا excl (qty 7)
  const stock = [
    { location: "br", sku: "S1", name: "S1", qty: 10, price_incl: 100, price_excl: 80 },
    { location: "br", sku: "S2", name: "S2", qty: 5, price_incl: 100, price_excl: 80 },
    { location: "br", sku: "S3", name: "S3", qty: 7, price_incl: 100, price_excl: null },
  ];
  db.sales = { uploads: async () => [{ id: "U1", location: "br", captured_at: now, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const txt = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const sinv = document.querySelector('#salesKpis .kpi[data-k="sinv"]');
  const sub2 = txt(sinv && sinv.querySelector(".kpi-sub2"));
  const missTxt = txt(sinv && sinv.querySelector(".kpi-sub2 .kpi-miss"));   // عدّاد «قبل الضريبة» في السطر الفرعيّ (لا عدّاد التكلفة في السطر الرئيسيّ)
  return { sub2, missTxt };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const num = s => { const m = String(s).match(/\d[\d,]*/); return m ? parseInt(m[0].replace(/,/g, ""), 10) : null; };
if (!BROKEN) {
  if (!/بسعر البيع بدون ضريبة/.test(res.sub2)) fails.push("لا سطر «بسعر البيع بدون ضريبة» للمخزون");
  if (num(res.sub2) !== 1200) fails.push(`«بدون ضريبة» ليست مجموع ذوات excl فقط (1200): «${res.sub2}»`);
  if (!/1/.test(res.missTxt) || !/بلا سعر قبل الضريبة/.test(res.missTxt)) fails.push(`عدّاد المستبعَدة غائب/خاطئ (توقّعت 1): «${res.missTxt}»`);
}
if (BROKEN) {
  // الناقص حُسب صفراً ⇒ لا عدّاد «مستبعدة»
  if (fails.length || !res.missTxt) { console.log("✅ (--broken) G-TAX-STOCK مسك العطل: الناقص حُسب صفراً بلا عدّاد مستبعَدة"); process.exit(0); }
  console.error("✗ (--broken) بقي العدّاد — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-TAX-STOCK:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-TAX-STOCK: «قبل الضريبة» = مجموع ذوات price_excl (1200) · الناقص مستبعَد بعدّاد (1) لا صفراً.");
