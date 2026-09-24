// ============================================================================
// G-COVERAGE-ONCE (ج-٢) — شريط «التغطية: معدّل …/يوم» يظهر مرّة واحدة (القيمة، لا الشكل):
//   renderSalesPage غير متزامنة (await على db)؛ كتابة التغطية بـlu.innerHTML += بعد await تتراكم
//   عند تشغيلين متداخلين (تغيير فلتر أثناء تحميل) ⇒ يظهر الشريط مرّتين. الإصلاح: عنصر #salesCoverage
//   مستقلّ يُستبدَل (SET) لا يُلحَق (+=)، فالتشغيل الثاني يستبدل لا يضيف.
//   يُشغَّل تشغيلان متداخلان فعلاً (تأخير حقيقيّ في الموك) ويُعدّ ظهور الشريط ⇒ يجب == 1.
// --broken: يعيد الكتابة بـlu.innerHTML += (الإلحاق) ⇒ التشغيلان المتداخلان يظهرانه مرّتين ⇒ يرسب.
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
  const A = 'const covEl = document.getElementById("salesCoverage");\n    if (covEl) covEl.innerHTML = ';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد كتابة التغطية"); process.exit(2); }
  html = html.replace(A, 'const covEl = document.getElementById("salesCoverage");\n    if (lu) lu.innerHTML += ');   // (--broken) الإلحاق القديم
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setViewport({ width: 1200, height: 900 });
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "kh", name: "الخضرة" }];
  salesPeriod = "all"; salesLoc = "all"; salesTab = "all";
  const now = new Date().toISOString();
  const stock = [{ location: "kh", sku: "K", name: "صنف", qty: 20, price_incl: 100, price_excl: 87, barcode: "b" }];
  const movs = [{ kind: "estimated_sale", delta: -5, value_est: 500, unit_price_incl: 100, unit_price_excl: 87, location: "kh", sku: "K", sku_name: "صنف", upload_id: "U", captured_at: now, period_days: 5 }];
  const ups = [{ id: "U", location: "kh", captured_at: now, suspect: false }];
  const wait = (v) => new Promise(r => setTimeout(() => r(v), 12));   // تأخير حقيقيّ ⇒ تداخل فعليّ بين التشغيلين
  db.sales = { uploads: async () => wait(ups), movements: async () => wait(movs), clearSuspect: async () => {} };
  sb = { rpc: async () => ({ data: [{ used: 0, cap: 500 }], error: null }), from: () => ({ select: () => ({ range: async (a) => wait({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  document.getElementById("page-sales").classList.add("active");
  // تشغيلان متداخلان (تغيير فلتر أثناء التحميل)
  await Promise.all([renderSalesPage(), renderSalesPage()]);
  const lu = document.getElementById("salesLastUp");
  const txt = (lu && lu.textContent) || "";
  const count = (txt.match(/التغطية: معدّل/g) || []).length;
  return { count, snippet: txt.replace(/\s+/g, " ").slice(0, 120) };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (BROKEN) {
  if (res.count > 1) { console.log(`✅ (--broken) G-COVERAGE-ONCE مسك التكرار: الشريط ظهر ${res.count} مرّات (الإلحاق).`); process.exit(0); }
  console.error(`✗ (--broken) لم يتكرّر (count=${res.count}) — لا أسنان (قد لا يتداخل التشغيلان).`); process.exit(1);
}
if (res.count !== 1) fails.push(`شريط التغطية ظهر ${res.count} مرّة (المتوقّع 1): «${res.snippet}»`);
if (fails.length) { console.error("✗ G-COVERAGE-ONCE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-COVERAGE-ONCE: شريط التغطية يظهر مرّة واحدة رغم تشغيلين متداخلين (#salesCoverage يُستبدَل لا يُلحَق).");
