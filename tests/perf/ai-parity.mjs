// ============================================================================
// G-AI-PARITY — تكافؤ المساعد مع الشاشة (أهمّ حارس في المشروع، القيمة لا الشكل):
//   لنفس الفترة ونفس الموقع: رقم المساعد (computeScope من sales_compute.mjs) = رقم الشاشة بالضبط.
//   المستودع (سحب 19,680) مستبعَد من الطرفين ⇒ 36,588 (9,772 + 26,816) لا 56,268.
// 🚨 sales_compute.mjs نسخة موازية للشاشة (الشاشة لا تستورده) — هذا الحارس هو ما يكشف أي انحراف.
// --broken: يكسر قاعدة واحدة في sales_compute (يُدخل المستودع: l!=="wh" ⇒ true) ⇒ رقم المساعد يتضخّم
//   ⇒ يخالف الشاشة ⇒ يرسب. (إثبات الأسنان على المصدر الحقيقيّ لا محاكاةً.)
// ============================================================================
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const BROKEN = process.argv.includes("--broken");
const html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
const COMPUTE = join(root, "supabase", "functions", "ai-assistant", "sales_compute.mjs");

// تجهيزة موحّدة تُغذّى للشاشة (المتصفّح) وللدالّة النقيّة (Node) معاً
const now = new Date().toISOString();
const branches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
const mv = (loc, sku, q, v) => ({ kind: "estimated_sale", delta: -q, value_est: v, unit_price_incl: v / q, unit_price_excl: Math.round(v / q / 1.15), location: loc, sku, sku_name: sku, upload_id: "U_" + loc, captured_at: now, period_days: 5 });
const movements = [mv("az", "A1", 500, 9772), mv("kh", "K1", 435, 26816), mv("wh", "W1", 445, 19680)];   // wh سحب — يجب استبعاده
const uploads = [{ id: "U_az", location: "az", captured_at: now, suspect: false }, { id: "U_kh", location: "kh", captured_at: now, suspect: false }, { id: "U_wh", location: "wh", captured_at: now, suspect: false }];
const stock = [{ location: "az", sku: "A1", name: "A1", qty: 100, price_incl: 20, price_excl: 17 }, { location: "kh", sku: "K1", name: "K1", qty: 200, price_incl: 30, price_excl: 26 }, { location: "wh", sku: "W1", name: "W1", qty: 1000, price_incl: 500, price_excl: 435 }];

// ————— (1) رقم الشاشة (المتصفّح) —————
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const screenVal = await p.evaluate(async (fx) => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = fx.branches; salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  db.sales = { uploads: async () => fx.uploads, movements: async (loc) => loc === "all" ? fx.movements : fx.movements.filter(m => m.location === loc), clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? fx.stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const rr = document.getElementById("result"); if (rr) rr.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const el = document.querySelector('#salesKpis .kpi[data-k="sval"] b');
  return el ? (el.textContent || "").replace(/[^\d]/g, "") : "";
}, { branches, movements, uploads, stock });
await b.close();

// ————— (2) رقم المساعد (الدالّة النقيّة) — من المصدر الحقيقيّ أو المكسور —————
let computeURL = pathToFileURL(COMPUTE).href, tmp = "";
if (BROKEN) {
  let src = readFileSync(COMPUTE, "utf8");
  const A = 'const branchLocs = locsAll.filter(l => l !== "wh");';
  if (!src.includes(A)) { console.error("✗ (--broken) لم أجد استثناء المستودع في computeScope"); process.exit(2); }
  src = src.replace(A, 'const branchLocs = locsAll.filter(l => true);   // (--broken) يُدخل المستودع');
  tmp = join(here, "_broken_sales_compute.mjs");
  writeFileSync(tmp, src);
  computeURL = pathToFileURL(tmp).href;
}
const { computeScope } = await import(computeURL);
const nowMs = Date.parse(now);
const r = computeScope({ movements, uploads, stock, branches, period: "all", location: "all", nowMs });
const assistantVal = String(Math.round(r.scope.val));
if (tmp) unlinkSync(tmp);

const fails = [];
if (errs.length) fails.push("أخطاء JS في الشاشة: " + errs.join(" | "));
if (screenVal !== "36588") fails.push(`رقم الشاشة ليس 36,588 (تجهيزة مكسورة؟): «${screenVal}»`);

const match = screenVal === assistantVal;
if (BROKEN) {
  // كسر قاعدة استثناء المستودع ⇒ رقم المساعد يتضخّم (يشمل 19,680) ⇒ يخالف الشاشة
  if (!match && assistantVal === "56268") { console.log(`✅ (--broken) G-AI-PARITY مسك الانحراف: المساعد ${assistantVal} ≠ الشاشة ${screenVal} (دخل المستودع).`); process.exit(0); }
  console.error(`✗ (--broken) لم يُكتشف الانحراف — لا أسنان (المساعد=${assistantVal} · الشاشة=${screenVal}).`); process.exit(1);
}
if (!match) fails.push(`تكافؤ منكسر: المساعد ${assistantVal} ≠ الشاشة ${screenVal} — عُدّل حساب الشاشة دون sales_compute.mjs؟`);
if (fails.length) { console.error("✗ G-AI-PARITY:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-AI-PARITY: المساعد = الشاشة = ${assistantVal} (المستودع مستبعَد من الطرفين، تكافؤ تامّ).`);
