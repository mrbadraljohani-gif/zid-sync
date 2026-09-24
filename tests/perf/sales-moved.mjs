// ============================================================================
// G-MOVED — «منتجات متحرّكة» رقم واحد بتعريف واحد = الأصناف الفريدة (القيمة، لا الشكل):
//   منتج تحرّك في موقعين يُعدّ مرّة. البطاقة العليا = بطاقة التفصيل = صفّ الإجمالي = الفريد.
//   وفحص ثانٍ: مجموع الأعمدة − الفريد = عدد الأصناف العابرة بين المواقع (قيمة محسوبة).
// تجهيزة: S1 في wh＋az · S2 في wh · S3 في az ⇒ أعمدة (2+2)=4 · فريد=3 · عابر=1.
// --broken: صفّ الإجمالي يستعمل مجموع الأعمدة (colMovedSum) بدل الفريد ⇒ 4≠3 ⇒ يرسب.
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
  const A = '<td class="n"><bdi dir="ltr">${salesNum(totUnique)}</bdi>${crossLoc > 0';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد خلية الفريد في صفّ الإجمالي"); process.exit(2); }
  html = html.replace(A, '<td class="n"><bdi dir="ltr">${salesNum(colMovedSum)}</bdi>${crossLoc > 0');
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
  const mk = (loc, sku, up) => ({ kind: "estimated_sale", delta: -2, value_est: 100, unit_price_incl: 50, unit_price_excl: 43, location: loc, sku, sku_name: sku, upload_id: up, captured_at: now, period_days: 2 });
  const movs = [mk("az", "S1", "UA"), mk("az", "S2", "UA"), mk("kh", "S1", "UK"), mk("kh", "S3", "UK")];   // S1 عابر بين فرعين
  const stock = [{ location: "az", sku: "S1", name: "S1", qty: 10, price_incl: 50 }, { location: "kh", sku: "S1", name: "S1", qty: 5, price_incl: 50 }];
  db.sales = { uploads: async () => [{ id: "UA", location: "az", captured_at: now, suspect: false }, { id: "UK", location: "kh", captured_at: now, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const txt = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const topMoved = txt(document.querySelector('#salesKpis .kpi[data-k="smoved"] b'));
  const cmp = document.getElementById("salesCmp");
  const totalMovedCell = txt(cmp.querySelector("tbody tr.total td:nth-child(4)"));   // عمود «متحركة»
  const totNote = txt(cmp.querySelector("tbody tr.total td.n .tot-note"));   // ملاحظة العابر في عمود «متحرّكة» (td.n) — لا «يشمل N من N» في خليّة الإجمالي (cmp-loc)
  // شريط التفصيل «متحرّكة» (تبويب جميع المواقع)
  const detailMoved = txt(document.querySelector('#salesDetail .s4-dstrip [data-k="smoved"] b'));
  return { topMoved, totalMovedCell, totNote, detailMoved };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const n = s => { const m = String(s).match(/\d+/); return m ? parseInt(m[0], 10) : null; };
if (!BROKEN) {
  if (n(res.topMoved) !== 3) fails.push(`البطاقة العليا «متحرّكة» ليست الفريد 3: «${res.topMoved}»`);
  if (n(res.totalMovedCell) !== 3) fails.push(`صفّ الإجمالي «متحركة» ليس الفريد 3: «${res.totalMovedCell}»`);
  if (n(res.detailMoved) !== 3) fails.push(`بطاقة التفصيل «متحرّكة» ليست الفريد 3: «${res.detailMoved}»`);
  if (!/1/.test(res.totNote) || !/موقع/.test(res.totNote)) fails.push(`وسم العابر ناقص (عابر=1): «${res.totNote}»`);
}
if (BROKEN) {
  if (fails.length || n(res.totalMovedCell) === 4) { console.log("✅ (--broken) G-MOVED مسك العطل: صفّ الإجمالي = مجموع الأعمدة (4) لا الفريد (3)"); process.exit(0); }
  console.error("✗ (--broken) لم يظهر 4 في الإجمالي — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-MOVED:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-MOVED: «متحرّكة» = الأصناف الفريدة (3) في البطاقة/التفصيل/الإجمالي · مجموع الأعمدة − الفريد = العابر (1).");
