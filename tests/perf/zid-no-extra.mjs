// ============================================================================
// G-ZID-NO-EXTRA (＋G-ZID-OUTPUT بنيويّاً) — رمز موقع غير-uuid لا يمرّ في مسار زد (القيمة، لا الشكل):
//   loadInventoryFromDB يبني mergeBranches من invBranches وحده ⇒ صفّ branch_id="haraj_maf" (لو تسرّب لـbranch_items)
//   يُسقَط تماماً ⇒ mergeInventory(mergeWh, mergeBranches) **مطابق** للحالة بلا صفّ الحراج (المخرج لزد لا يتغيّر).
// --broken: loadInventoryFromDB يمرّ على salesAllLocs() بدل invBranches ⇒ الحراج يدخل mergeBranches ⇒ المخرج يتغيّر ⇒ يرسب.
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
  const A = "mergeBranches = invBranches.map(b => (byBr.get(b.id) || []).map(r => { const m = invRowToMerge(r); m.bid = b.id; return m; })).filter(list => list.length);";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد بناء mergeBranches"); process.exit(2); }
  html = html.replace(A, "mergeBranches = salesAllLocs().map(b => (byBr.get(b.id) || []).map(r => { const m = invRowToMerge(r); m.bid = b.id; return m; })).filter(list => list.length);");   // يُدخل الحراج
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; sb = {};
  // branch_items يحوي صفّ فرع زد (az) ＋ صفّ برمز حراج تسرّب اصطناعياً (branch_id="haraj_maf")
  const brRows = [
    { code: "A", name: "صنف", qty: 10, price_incl: 100, price_excl: 87, row_order: 0, branch_id: "az" },
    { code: "HX", name: "حراج", qty: 999, price_incl: 500, price_excl: 435, row_order: 1, branch_id: "haraj_maf" },
  ];
  db.inventory.getAll = async (t) => t === "warehouse_items" ? [{ code: "A", name: "صنف", qty: 5, price_incl: 100, price_excl: 87, row_order: 0 }] : brRows;
  db.branches = { getAll: async () => [{ id: "az", name: "العزيزية" }] };   // invBranches = az فقط (الحراج ليس فيها)
  await loadInventoryFromDB();
  const flat = (mergeBranches || []).flat();
  const bids = [...new Set(flat.map(r => r.bid))];
  const codes = flat.map(r => r.code);
  const merged = mergeInventory(mergeWh, mergeBranches);
  const hxInMerge = merged.unified.concat(merged.noPrice).some(u => u.code === "HX");
  return { bids, hasHarajCode: codes.includes("HX"), hxInMerge, total: merged.total };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (BROKEN) {
  if (res.hasHarajCode || res.hxInMerge) { console.log("✅ (--broken) G-ZID-NO-EXTRA مسك التسريب: رمز الحراج دخل مسار زد (bids=" + res.bids.join(",") + ")"); process.exit(0); }
  console.error("✗ (--broken) لم يتسرّب الحراج — لا أسنان."); process.exit(1);
}
if (res.hasHarajCode) fails.push("🚨 صفّ الحراج دخل mergeBranches (bids=" + res.bids.join(",") + ")");
if (res.hxInMerge) fails.push("🚨 كود الحراج HX دخل ناتج mergeInventory (يصل ملفَّي زد!)");
if (res.bids.length !== 1 || res.bids[0] !== "az") fails.push("mergeBranches ليس az وحده: " + res.bids.join(","));
if (fails.length) { console.error("✗ G-ZID-NO-EXTRA:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-ZID-NO-EXTRA: رمز الحراج غير-uuid أُسقط من mergeBranches ومن mergeInventory — مسار زد بلا تغيير (bids=az فقط).");
