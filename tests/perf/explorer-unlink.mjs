// ============================================================================
// G-EXPUNLINK — المستكشف: شريحة «رابط محفوظ» ＋ إلغاء ربط دفعيّ عبر نفس المسار الآمن.
//   ① buildExplorerRows.saved = رابط محفوظ في mappings حصراً (لا مطابَق بالكود).
//   ② شريحة الفلتر «saved» تعزل المحفوظة فقط.
//   ③ bulkUnlinkExplorer يستعمل dbDelMapping (unlinkedSet) — نفس مسار «تم تحديثه»
//      ⇒ الصنف الغائب المربوط يعود «يحتاج ربط» لا «غائب» (لا تصفير). يُثبَت بالسطر:
//      hasHistory=(manualMap||matchedHistory) && !unlinkedSet ⇒ بعد dbDelMapping = false.
// --broken: يجعل saved = linked (يشمل المطابَق بالكود) ⇒ الشريحة تعرض المئات لا 22 ⇒ يرسب.
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
  const FIX = "const saved = !!manualMap[raw];";
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد سطر saved"); process.exit(2); }
  html = html.replace(FIX, "const saved = !!manualMap[raw] || whSet.has(skuN) || whSet.has(normCode(baseOf(raw)));");   // يشمل المطابَق بالكود
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  // زد: A مطابَق بالكود (كوده في المخزن) · M رابط محفوظ لكود غائب (مقلاة ارت لين) · N بلا ربط
  stData = { sheetName: "P", header: ["sku", "name_ar", "name_en", "quantity", "price", "barcode", "sale_price", "published", "has_variants", "parent_ref"],
    rows: [["sku", "name_ar", "name_en", "quantity", "price", "barcode", "sale_price", "published", "has_variants", "parent_ref"],
      ["A", "صنف A", "", "5", "100", "", "", "Yes", "No", ""],
      ["422016", "مقلاة ارت لين", "", "0", "100", "", "", "Yes", "No", ""],
      ["N", "صنف N", "", "3", "100", "", "", "Yes", "No", ""]] };
  manualMap = { "422016": "MISSINGCODE" };   // رابط محفوظ لكود غائب عن المخزن
  lastMerge = { unified: [{ code: "A" }], noPrice: [] };   // A فقط في المخزن (المطابَق بالكود)
  lastAbsent = [{ skuN: "422016" }];
  waitingSet = new Set(); expSelected = new Set();
  try { rebuildFamilyIndex(); } catch (e) {}
  const rows = buildExplorerRows();
  const bySku = Object.fromEntries(rows.map(r => [r.sku, r]));
  const savedRows = rows.filter(r => r.saved).map(r => r.sku);
  const linkedRows = rows.filter(r => r.linked).map(r => r.sku);
  return {
    savedRows, linkedRows,
    A_saved: bySku["A"] && bySku["A"].saved, A_linked: bySku["A"] && bySku["A"].linked,
    M_saved: bySku["422016"] && bySku["422016"].saved,
  };
});
await b.close();
const fails = [];
// ① saved = mappings فقط (422016)، لا A المطابَق بالكود
if (res.M_saved !== true) fails.push("① 422016 (رابط محفوظ) saved يجب true");
if (res.A_saved !== false) fails.push(`① A (مطابَق بالكود لا محفوظ) saved يجب false — جاء ${res.A_saved}`);
if (res.A_linked !== true) fails.push("① A linked يجب true (مطابَق بالكود)");
if (res.savedRows.length !== 1 || res.savedRows[0] !== "422016") fails.push(`② شريحة «رابط محفوظ» تعزل المحفوظ فقط — جاء [${res.savedRows}] (متوقّع [422016])`);
// linked يشمل A وM (كلاهما «مربوط» بالمعنى الواسع) — يثبت أنّ saved أضيق
if (!(res.linkedRows.includes("A") && res.linkedRows.includes("422016"))) fails.push("سلامة: linked يجب أن يشمل A وM");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-EXPUNLINK مسك خلط saved بالمطابَق: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد جعل saved=linked — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-EXPUNLINK:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-EXPUNLINK: «رابط محفوظ» يعزل mappings فقط ([${res.savedRows}]، لا A المطابَق بالكود) · linked أوسع (A+M).`);
