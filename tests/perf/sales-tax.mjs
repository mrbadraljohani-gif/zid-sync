// ============================================================================
// G-TAX — «قبل الضريبة» من unit_price_excl المخزَّن، لا ضرب/قسمة على 1.15 (القيمة، لا الشكل):
//   بيع 5 وحدات × سعر شامل 100 (=500) وقبل الضريبة 87 (=435) ⇒ الرقم الرئيسيّ 500 وسطر «قبل الضريبة 435».
//   435 ليست 500/1.15 (=434.78→435 بالمصادفة قريبة) — لذا نستعمل excl=80 ⇒ 400، وهو ≠ 500/1.15=435.
// --broken: يشتقّ excl بقسمة الشامل على 1.15 بدل قراءة unit_price_excl ⇒ 435 لا 400 ⇒ يرسب.
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
  const A = "if (m.unit_price_excl != null) { const ve = u * (Number(m.unit_price_excl) || 0); a.estValueExcl += ve; L.valueExcl += ve; }";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد سطر estValueExcl"); process.exit(2); }
  html = html.replace(A, "if (m.value_est != null) { const ve = (Number(m.value_est)||0) / 1.15; a.estValueExcl += ve; L.valueExcl += ve; }   // (--broken) اشتقاق بالقسمة على 1.15");
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
  const now = new Date().toISOString();
  // شامل 100 (×5=500) · قبل الضريبة 80 (×5=400). 400 ≠ 500/1.15 (=435).
  const movs = [{ kind: "estimated_sale", delta: -5, value_est: 500, unit_price_incl: 100, unit_price_excl: 80, location: "wh", sku: "A1", sku_name: "صنف", upload_id: "U1", captured_at: now, period_days: 2 }];
  const stock = [{ location: "wh", sku: "A1", name: "صنف", qty: 40, price_incl: 100 }];
  db.sales = { uploads: async () => [{ id: "U1", location: "wh", captured_at: now, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const txt = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const sval = document.querySelector('#salesKpis .kpi[data-k="sval"]');
  const main = txt(sval && sval.querySelector("b"));
  const excl = txt(sval && sval.querySelector(".kpi-sub2"));
  const has115 = /1\.15/.test((await (async()=>document.documentElement.outerHTML)()));
  return { main, excl };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const num = s => { const m = String(s).match(/\d[\d,]*/); return m ? parseInt(m[0].replace(/,/g, ""), 10) : null; };
if (!BROKEN) {
  if (num(res.main) !== 500) fails.push(`الرقم الرئيسيّ ليس شاملاً 500: «${res.main}»`);
  if (!/قبل الضريبة/.test(res.excl)) fails.push("لا سطر «قبل الضريبة»");
  if (num(res.excl) !== 400) fails.push(`«قبل الضريبة» ليست من unit_price_excl (=400): «${res.excl}»`);
}
if (BROKEN) {
  if (fails.length || num(res.excl) === 435) { console.log("✅ (--broken) G-TAX مسك العطل: «قبل الضريبة» اشتُقّت بالقسمة على 1.15 (" + res.excl + ") بدل 400"); process.exit(0); }
  console.error("✗ (--broken) لم تُشتقّ بالقسمة — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-TAX:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-TAX: الرئيسيّ شامل (500) · «قبل الضريبة» من unit_price_excl مباشرةً (400) لا قسمةً على 1.15.");
