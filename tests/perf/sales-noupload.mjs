// ============================================================================
// G-NOUPLOAD — موقع بلا رفعة في الفترة: لا صفر ولا نسبة، ومستبعَد من الإجماليّ (القيمة، لا الشكل):
//   المستودع بلا رفعة داخل النافذة ⇒ صفّه «لا رفعة في هذه الفترة» ·
//   إجماليّ المبيعات = مجموع المرفوعة وحدها (لا يضمّ صفر المستودع) · صمّام يبيّن الغياب.
// --broken: يُلغي شرط uploadedInPeriod في الـscope ⇒ المستودع يدخل بأصفاره (لا يتغيّر الإجماليّ عددياً هنا،
//           لكن يظهر صفّه بأرقام 0 و«-100%») ⇒ يرسب على ظهور الصفّ الصفريّ بدل «لا رفعة».
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
  const A = "if (!uploadedInPeriod.has(d.loc)) return rowT(d.name, salesLocColor(d.loc), null, \"\", true);";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد حارس الموقع الغائب في الجدول"); process.exit(2); }
  html = html.replace(A, "/* (--broken) بلا معالجة الغياب */");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }]; salesPeriod = "7"; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  const day = 86400000, now = Date.now(), iso = t => new Date(t).toISOString();
  // العزيزية: رفعة داخل الفترة (بيع). المستودع: آخر رفعة قبل 18 ساعة؟ لا — نجعلها خارج نافذة 7 أيام: قبل 9 أيام.
  const azCur = iso(now - 1 * day), whOld = iso(now - 9 * day);
  const movs = [
    { kind: "estimated_sale", delta: -6, value_est: 600, unit_price_incl: 100, unit_price_excl: 87, location: "az", sku: "A1", sku_name: "صنف فرع", upload_id: "UAZ", captured_at: azCur, period_days: 1 },
    // حركة المستودع قديمة (خارج نافذة 7 أيام) — لن تدخل curSince
    { kind: "estimated_sale", delta: -10, value_est: 1000, unit_price_incl: 100, unit_price_excl: 87, location: "wh", sku: "W1", sku_name: "صنف مستودع", upload_id: "UWH", captured_at: whOld, period_days: 1 },
  ];
  const stock = [{ location: "az", sku: "A1", name: "صنف فرع", qty: 30, price_incl: 100 }, { location: "wh", sku: "W1", name: "صنف مستودع", qty: 50, price_incl: 100 }];
  db.sales = { uploads: async () => [{ id: "UAZ", location: "az", captured_at: azCur, suspect: false }, { id: "UWH", location: "wh", captured_at: whOld, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const txt = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const cmp = document.getElementById("salesCmp");
  const rowsTxt = [...cmp.querySelectorAll("tbody tr")].map(txt);
  const totalVal = (cmp.querySelector("tbody tr.total td.n bdi") || {}).textContent || "";
  const miss = txt(document.getElementById("salesMissBanner"));
  const missShown = (document.getElementById("salesMissBanner") || {}).style.display !== "none";
  return { rowsTxt, totalVal, miss, missShown };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const whRow = res.rowsTxt.find(t => /مستودع|wh/i.test(t)) || res.rowsTxt.find(t => /لا رفعة/.test(t));
if (!BROKEN) {
  if (!res.rowsTxt.some(t => /لا رفعة في هذه الفترة/.test(t))) fails.push("صفّ المستودع بلا «لا رفعة في هذه الفترة»");
  if (res.rowsTxt.some(t => /-100/.test(t))) fails.push("ظهرت نسبة «-100%» لموقع بلا رفعة");
  if (res.totalVal.replace(/[^\d]/g, "") !== "600") fails.push(`الإجمالي ليس مجموع المرفوعة وحدها (600): «${res.totalVal}»`);
  if (!(res.missShown && /رفعة/.test(res.miss) && /الإجمالي يشمل/.test(res.miss))) fails.push(`صمّام الغياب ناقص (ماذا/كم): «${res.miss}»`);
}
if (BROKEN) {
  const hasZeroRow = res.rowsTxt.some(t => /-100/.test(t)) || !res.rowsTxt.some(t => /لا رفعة/.test(t));
  if (fails.length || hasZeroRow) { console.log("✅ (--broken) G-NOUPLOAD مسك العطل: الموقع الغائب ظهر بأصفار/-100% بدل «لا رفعة»"); process.exit(0); }
  console.error("✗ (--broken) لم يظهر صفّ صفريّ بعد إلغاء المعالجة — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-NOUPLOAD:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-NOUPLOAD: الموقع بلا رفعة ⇒ «لا رفعة» (لا صفر/نسبة) · الإجمالي = المرفوعة وحدها (600) · صمّام يبيّن الغياب.");
