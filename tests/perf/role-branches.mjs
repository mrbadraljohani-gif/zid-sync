// ============================================================================
// G-ROLE-BRANCHES — دور يرى الشاشة يجب أن يرى بياناتها (القيمة، لا الإخفاء):
//   🚨 الدرس (دفعة أ): حراس الأدوار كانت تفحص «هل يُخفى المساعد» ولم تفحص «هل تظهر البيانات».
//   سياسة restrictive على جدول أسماء الفروع منعت marketing من قراءتها ⇒ invBranches فارغ ⇒
//   اختفت العزيزية والخضرة من الشاشة، ولم يبقَ إلّا الحراج الثابت.
//   ① بفروع زد محمَّلة (invBranches=2) ⇒ salesAllLocs() = 4 (2 زد ＋ 2 حراج) · لا تحذير فروع.
//   ② بفشل التحميل (invBranches=[]) لكن البيانات فيها az/kh ⇒ salesAllLocs()=2 (حراج فقط) **و**
//      تحذير «تعذّر تحميل قائمة الفروع» ظاهر — 🚫 لا نصف فروع بصمت (أ-٢).
// --broken: يزيل منطق التحذير (/* branch-warn */) ⇒ الحالة ② تعرض فرعين بصمت بلا تحذير ⇒ يرسب.
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
  // يعطّل صمّام صمت النقص: التحذير لا يظهر أبداً ⇒ نصف فروع بصمت
  const A = 'const branchWarn = document.getElementById("salesBranchWarn");';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد منطق تحذير الفروع"); process.exit(2); }
  html = html.replace(A, 'const branchWarn = null;   // (--broken) تعطيل التحذير');
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setViewport({ width: 1200, height: 900 });
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "marketing"; authSession = { user: { email: "m@x.sa" } };
  salesPeriod = "all"; salesLoc = "all"; salesTab = "all";
  const now = new Date().toISOString();
  const stock = [
    { location: "az", sku: "A", name: "صنف A", qty: 10, price_incl: 100, price_excl: 87, barcode: "1" },
    { location: "kh", sku: "K", name: "صنف K", qty: 20, price_incl: 100, price_excl: 87, barcode: "2" },
    { location: "haraj_maf", sku: "H", name: "صنف H", qty: 5, price_incl: 100, price_excl: 87, barcode: "3" },
  ];
  const movs = [{ kind: "estimated_sale", delta: -5, value_est: 500, unit_price_incl: 100, unit_price_excl: 87, location: "kh", sku: "K", sku_name: "صنف K", upload_id: "U_kh", captured_at: now, period_days: 5 }];
  const ups = [{ id: "U_kh", location: "kh", captured_at: now, suspect: false }, { id: "U_az", location: "az", captured_at: now, suspect: false }];
  db.sales = { uploads: async () => ups, movements: async () => movs, clearSuspect: async () => {} };
  sb = { rpc: async () => ({ data: [{ used: 0, cap: 500 }], error: null }), from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  document.getElementById("page-sales").classList.add("active");
  const warnShown = () => { const el = document.getElementById("salesBranchWarn"); return !!(el && el.style.display !== "none" && (el.textContent || "").includes("تعذّر تحميل قائمة الفروع")); };

  // ① فروع زد محمَّلة
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
  const locsFull = salesAllLocs().map(x => x.id);
  await renderSalesPage();
  const warnFull = warnShown();

  // ② فشل التحميل (RLS/شبكة) — invBranches فارغ لكن البيانات فيها az/kh
  invBranches = [];
  const locsEmpty = salesAllLocs().map(x => x.id);
  await renderSalesPage();
  const warnEmpty = warnShown();

  return { locsFull, locsEmpty, warnFull, warnEmpty };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const zidFull = res.locsFull.filter(l => l === "az" || l === "kh").length;
if (BROKEN) {
  if (!res.warnEmpty) { console.log("✅ (--broken) G-ROLE-BRANCHES مسك صمت النقص: invBranches فارغ ⇒ فرعان بصمت بلا تحذير."); process.exit(0); }
  console.error("✗ (--broken) التحذير ظهر رغم تعطيله — لا أسنان."); process.exit(1);
}
if (res.locsFull.length !== 4) fails.push(`① salesAllLocs ليست 4 فروع بفروع زد محمَّلة: [${res.locsFull.join(",")}]`);
if (zidFull !== 2) fails.push(`① فرعا زد (az/kh) غائبان عن التعداد: [${res.locsFull.join(",")}]`);
if (res.warnFull) fails.push("① تحذير الفروع ظهر رغم اكتمال التحميل");
if (res.locsEmpty.length !== 2) fails.push(`② بفشل التحميل salesAllLocs ليست 2 (حراج فقط): [${res.locsEmpty.join(",")}]`);
if (!res.warnEmpty) fails.push("② 🚨 invBranches فارغ لكن لا تحذير — نصف فروع بصمت (أ-٢)");
if (fails.length) { console.error("✗ G-ROLE-BRANCHES:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-ROLE-BRANCHES: بفروع زد ⇒ 4 مواقع بلا تحذير · بفشل التحميل ⇒ 2 (حراج) ＋ تحذير صريح «تعذّر تحميل قائمة الفروع» (لا صمت نقص).");
