// ============================================================================
// G-PRICE-LADDER — سلّم سعر الحركة الحاضرة في الملف (القيمة، لا الشكل):
//   ① المستوى ١ (صفّ الملف) له الأولويّة ⇒ price_source="incl"/"excl" والقيمة كما الملف (حياد — لا تغيير لما كان صحيحاً).
//   ② بلا سعر ملفّ ⇒ المستوى ٢ (جدول الموقع، existMap) ⇒ "db_loc"/"db_loc_excl" وvalue_est غير فارغة.
//   ③ بلا ١ ولا ٢ ⇒ المستوى ٣ (المستودع/زد، fallbackPrices) ⇒ "db_wh"/"db_wh_excl".
//   ④ بلا شيء ⇒ "none" وقيمة فارغة.
//   ⑤ 🚨 أولوية ٢ على ٣: وجود سعر جدول الموقع ＋ سعر مستودع ⇒ يُستعمل db_loc لا db_wh.
//   ⑥ 🚨 disappeared تبقى كما هي: تقرأ من القاعدة (old) ولا يمسّها fallback (بلا سعر ⇒ none ولو وُجد في fallback).
//   ⑦ 🚨 عزل الحراج: بناء fallback من warehouse_items ＋ branch_items فقط — 🚫 لا sales_branch_items.
// --broken: يُلغى السلّم (السعر من الملف فقط) ⇒ الحركة بلا سعر ملفّ تعود "none" ⇒ يرسب.
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
  const A = "const { incl, excl, ps } = priceLadder(r, code, existMap, fallbackPrices);";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد استدعاء priceLadder"); process.exit(2); }
  html = html.replace(A, 'const incl = numOrNull(r.price_incl), excl = numOrNull(r.price_excl), ps = incl != null ? "incl" : (excl != null ? "excl" : "none");');   // العطل: الملف فقط بلا سلّم
}
// ⑦ عزل ساكن: بناء fallback من warehouse_items ＋ branch_items فقط — لا sales_branch_items
const fbBlock = html.slice(html.indexOf("let fallbackPrices = null;"), html.indexOf("const anz = analyzeMovements"));
// العزل يُثبَت ببنية الحلقة نفسها: تكرّر حصراً على جدولَي زد (لا sales_branch_items كهدف getAllCodes)
const isoOk = /for \(const t of \["warehouse_items", "branch_items"\]\)/.test(fbBlock) && !/getAllCodes\(\s*["'`]?sales_branch_items/.test(fbBlock);
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { if (/^https?:/.test(r.url())) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(() => {
  const cap = new Date().toISOString(), prev = new Date(Date.now() - 86400000).toISOString();
  const E = (qty, incl, excl) => ({ qty, name: "x", price_incl: incl, price_excl: excl });
  const existMap = new Map([
    ["K1", E(10, 100, 90)],    // ٢ db_loc
    ["K2", E(10, null, null)], // ١ (الملف يسعّره)
    ["K3", E(10, null, null)], // ٣ db_wh
    ["K4", E(10, null, null)], // ٤ none
    ["K5", E(10, 60, null)],   // ٥ أولوية ٢ على ٣
    ["K6", E(10, null, null)], // ٣ db_wh_excl
    ["K7", E(5, 30, 25)],      // ⑥ disappeared (من الملف غائب) — يقرأ old
    ["K8", E(4, null, null)],  // ⑥ disappeared بلا سعر ＋ موجود في fallback ⇒ يبقى none (fallback لا يمسّ disappeared)
  ]);
  const rows = [
    { code: "K1", qty: 8 },                  // delta -2، بلا سعر ملفّ
    { code: "K2", qty: 8, price_incl: 50 },  // delta -2، سعر ملفّ
    { code: "K3", qty: 7 },                  // delta -3
    { code: "K4", qty: 9 },                  // delta -1
    { code: "K5", qty: 8 },                  // delta -2
    { code: "K6", qty: 8 },                  // delta -2
  ];   // K7/K8 غائبان عن الملف ⇒ disappeared
  const fallbackPrices = new Map([
    ["K3", { price_incl: 80, price_excl: 70 }],
    ["K5", { price_incl: 999, price_excl: 900 }],   // يجب ألّا يُستعمَل (٢ أولى)
    ["K6", { price_incl: null, price_excl: 70 }],
    ["K8", { price_incl: 500, price_excl: 400 }],    // يجب ألّا يمسّ disappeared
  ]);
  const movs = computeMovements(existMap, rows, "az", cap, prev, fallbackPrices);
  const by = {}; for (const m of movs) by[m.sku] = { ps: m.price_source, incl: m.unit_price_incl, excl: m.unit_price_excl, v: m.value_est, kind: m.kind };
  return by;
});
await b.close();

if (BROKEN) {
  const caught = res.K1 && res.K1.ps === "none" && res.K1.v == null;   // بلا سلّم: K1 (سعره من جدول الموقع) يعود none
  if (caught) { console.log("✅ (--broken) G-PRICE-LADDER مسك العطل: بلا سلّم ⇒ الحركة بلا سعر ملفّ تعود none بلا قيمة."); process.exit(0); }
  console.error("✗ (--broken) لم يُرصَد العطل — لا أسنان. " + JSON.stringify(res)); process.exit(1);
}
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!isoOk) fails.push("⑦ عزل الحراج: بناء fallback لا يقتصر على warehouse_items+branch_items (أو يمسّ sales_branch_items)");
const chk = (sku, ps, incl, v, kind) => { const m = res[sku]; if (!m) { fails.push(`${sku} غائب`); return; } if (m.ps !== ps) fails.push(`${sku}: price_source=${m.ps} (متوقّع ${ps})`); if (incl !== undefined && m.incl !== incl) fails.push(`${sku}: incl=${m.incl} (متوقّع ${incl})`); if (v !== undefined && m.v !== v) fails.push(`${sku}: value_est=${m.v} (متوقّع ${v})`); if (kind && m.kind !== kind) fails.push(`${sku}: kind=${m.kind} (متوقّع ${kind})`); };
chk("K1", "db_loc", 100, 200, "estimated_sale");        // ②
chk("K2", "incl", 50, 100, "estimated_sale");           // ① حياد: الملف كما هو
chk("K3", "db_wh", 80, 240, "estimated_sale");          // ③
chk("K4", "none", null, null, "estimated_sale");        // ④
chk("K5", "db_loc", 60, 120, "estimated_sale");         // ⑤ أولوية ٢ على ٣ (60 لا 999)
chk("K6", "db_wh_excl", null, 140, "estimated_sale");   // ③ excl (unit=excl=70 ⇒ 2×70)
chk("K7", "incl", 30, undefined, "disappeared");        // ⑥ disappeared من old
chk("K8", "none", null, null, "disappeared");           // ⑥ disappeared لا يمسّه fallback
if (fails.length) { console.error("✗ G-PRICE-LADDER:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-PRICE-LADDER: ① ملف أولاً (حياد) · ② db_loc · ③ db_wh/db_wh_excl · ④ none · ⑤ أولوية جدول الموقع على المستودع · ⑥ disappeared من القاعدة بلا fallback · ⑦ عزل الحراج (warehouse+branch فقط).");
