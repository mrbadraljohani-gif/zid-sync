// ============================================================================
// G-MOVE — محرّك حركات لوحة المبيعات المقدّرة (القيمة، لا الشكل):
//   10→5 ⇒ delta=-5 · estimated_sale · value_est=5×السعر (مثبَّت من الرفعة)
//   3→8  ⇒ delta=+5 · purchase (لا مبيعات) · value_est=null
//   كود جديد ⇒ new (qty_before=null · period_start=null)
//   كود اختفى ⇒ disappeared (delta=-oldQty · value=null)
//   دلتا الصفر لا تُدرَج إطلاقاً · period_days من الرفعة السابقة
//   العزل: run()/mergeInventory لا يذكران محرّك الحركات · التسجيل بعد bulkUpsert.
// --broken: يعكس تعيين النوع (delta<0⇒purchase) ⇒ A يصير purchase ⇒ يرسب.
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
  const A = 'const kind = !had ? "new" : (delta < 0 ? "estimated_sale" : "purchase");';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد سطر تعيين النوع"); process.exit(2); }
  html = html.replace(A, 'const kind = !had ? "new" : (delta < 0 ? "purchase" : "estimated_sale");');
}
const script = html.slice(html.lastIndexOf("\n<script>\n"), html.lastIndexOf("\n</script>"));
function fnSrc(name) {
  const i = script.indexOf("function " + name + "("); if (i < 0) return "";
  let d = 0, started = false;
  for (let j = i; j < script.length; j++) { const c = script[j]; if (c === "{") { d++; started = true; } else if (c === "}") { d--; if (started && d === 0) return script.slice(i, j + 1); } }
  return script.slice(i);
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  // القديم = صفّ كامل {qty,name,price_*} (بعد إثراء القراءة) — لتقييم المختفي بسعره الأخير
  const existMap = new Map([
    ["A", { qty: 10, name: "سيف", price_incl: 100 }],
    ["B", { qty: 3, name: "رمح", price_incl: 200 }],
    ["D", { qty: 5, name: "مختفٍ", price_incl: 500 }],   // اختفى — يُقيَّم 5×500=2500
    ["E", { qty: 4, name: "ثابت", price_incl: 30 }],     // 4→4 ⇒ دلتا صفر ⇒ لا يُدرَج
  ]);
  const rows = [
    { code: "A", qty: 5, price_incl: 100, price_excl: 87, name: "سيف" },   // 10→5 بيع مقدّر
    { code: "B", qty: 8, price_incl: 200, name: "رمح" },                    // 3→8 شراء
    { code: "C", qty: 7, price_incl: 50, name: "درع" },                     // جديد
    { code: "E", qty: 4, price_incl: 30, name: "ثابت" },                    // 4→4 دلتا صفر
  ];
  const movs = computeMovements(existMap, rows, "wh", "2026-09-22T00:00:00Z", "2026-09-20T00:00:00Z");
  const by = {}; for (const m of movs) by[m.sku] = m;
  return {
    count: movs.length,
    A: by.A, B: by.B, C: by.C, D: by.D, hasE: !!by.E,
    anyZero: movs.some(m => m.delta === 0),
  };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const A = res.A || {}, B = res.B || {}, C = res.C || {}, D = res.D || {};
if (!(A.delta === -5 && A.kind === "estimated_sale")) fails.push(`A: توقّعت delta=-5 estimated_sale، وجدت delta=${A.delta} kind=${A.kind}`);
if (A.value_est !== 500) fails.push(`A: value_est توقّعت 500 (5×100 مثبَّت)، وجدت ${A.value_est}`);
if (A.period_days !== 2) fails.push(`A: period_days توقّعت 2، وجدت ${A.period_days}`);
if (!(B.delta === 5 && B.kind === "purchase")) fails.push(`B: توقّعت delta=+5 purchase (شراء لا بيع)، وجدت delta=${B.delta} kind=${B.kind}`);
if (B.value_est != null) fails.push(`B: الشراء لا يُقيَّم كبيع — value_est يجب null، وجدت ${B.value_est}`);
if (!(C.kind === "new" && C.qty_before == null && C.period_start == null)) fails.push(`C: توقّعت new/qty_before=null/period_start=null، وجدت kind=${C.kind} qb=${C.qty_before} ps=${C.period_start}`);
if (!(D.kind === "disappeared" && D.delta === -5 && D.qty_after == null)) fails.push(`D: توقّعت disappeared/delta=-5/qty_after=null، وجدت kind=${D.kind} delta=${D.delta}`);
if (D.sku_name !== "مختفٍ") fails.push(`D: المختفي بلا اسم — توقّعت «مختفٍ»، وجدت ${D.sku_name}`);
if (D.unit_price_incl !== 500) fails.push(`D: المختفي بلا سعر — توقّعت 500، وجدت ${D.unit_price_incl}`);
if (D.value_est !== 2500) fails.push(`D: قيمة المختفي — توقّعت 2500 (5×500)، وجدت ${D.value_est} (لوحة تبدو كاملة وهي ناقصة)`);
if (res.hasE) fails.push("E: دلتا الصفر (4→4) أُدرِجت — يجب تخطّيها إطلاقاً");
if (res.anyZero) fails.push("أُدرجت حركة delta=0");
if (res.count !== 4) fails.push(`عدد الحركات ${res.count} (توقّعت 4: A,B,C,D بلا E)`);
// العزل (حياد): محرّك الحركات لا يمسّ المطابقة/الدمج
const run = fnSrc("run"), mrg = fnSrc("mergeInventory"), rec = fnSrc("recordMovements"), sync = fnSrc("syncInventoryToDB");
for (const bad of ["recordMovements", "computeMovements", "sales_movements", "sales_uploads"]) {
  if (run.includes(bad)) fails.push(`العزل: run() يذكر «${bad}» (يجب لا)`);
  if (mrg.includes(bad)) fails.push(`العزل: mergeInventory يذكر «${bad}» (يجب لا)`);
}
if (rec.includes("warehouse_items") || rec.includes("branch_items")) fails.push("العزل: recordMovements يكتب في جداول المخزون (يجب sales_* فقط)");
if (!(sync.indexOf("bulkUpsert") >= 0 && sync.indexOf("recordMovements(") > sync.indexOf("bulkUpsert"))) fails.push("الترتيب: recordMovements ليست بعد bulkUpsert");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-MOVE مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد عكس النوع — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-MOVE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-MOVE: 10→5 بيع مقدّر (value مثبَّت) · 3→8 شراء · جديد · اختفى · دلتا صفر مُتخطّاة · معزول عن المطابقة/الدمج · التسجيل بعد الكتابة.");
