// ============================================================================
// G-ZID-OUTPUT — مخرج مسار زد ثابت قبل/بعد وجود بيانات الحراج (القيمة، لا الشكل):
//   loadInventoryFromDB ثم mergeInventory — مرّتان على نفس بيانات زد: (أ) branch_items فيه فرع زد فقط،
//   (ب) نفسه ＋ صفّ برمز حراج (تسرّب اصطناعيّ). الناتج (total ＋ أكواد unified مرتّبة) **متطابق حرفياً**
//   ⇒ ملفّا الكميات/الأسعار (المبنيّان من هذا الناتج في run) ثابتان — الحراج لا يغيّر مخرج زد.
// --broken: loadInventoryFromDB يمرّ على salesAllLocs ⇒ صفّ الحراج يدخل (ب) ⇒ الناتجان يختلفان ⇒ يرسب.
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
  html = html.replace(A, "mergeBranches = salesAllLocs().map(b => (byBr.get(b.id) || []).map(r => { const m = invRowToMerge(r); m.bid = b.id; return m; })).filter(list => list.length);");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; sb = {};
  const wh = [{ code: "A", name: "صنف", qty: 5, price_incl: 100, price_excl: 87, row_order: 0 }];
  const brZidOnly = [{ code: "A", name: "صنف", qty: 10, price_incl: 100, price_excl: 87, row_order: 0, branch_id: "az" }];
  const brWithHaraj = brZidOnly.concat([{ code: "HX", name: "حراج", qty: 999, price_incl: 500, price_excl: 435, row_order: 1, branch_id: "haraj_maf" }]);
  db.branches = { getAll: async () => [{ id: "az", name: "العزيزية" }] };   // invBranches = az (الحراج ليس فيها)
  const snap = () => { const m = mergeInventory(mergeWh, mergeBranches); return { total: m.total, codes: m.unified.concat(m.noPrice).map(u => u.code).sort().join("|") }; };
  db.inventory.getAll = async (t) => t === "warehouse_items" ? wh : brZidOnly;
  await loadInventoryFromDB(); const before = snap();
  db.inventory.getAll = async (t) => t === "warehouse_items" ? wh : brWithHaraj;
  await loadInventoryFromDB(); const after = snap();
  return { before, after };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const identical = res.before.total === res.after.total && res.before.codes === res.after.codes;
if (BROKEN) {
  if (!identical) { console.log(`✅ (--broken) G-ZID-OUTPUT مسك التغيّر: المخرج اختلف (قبل total=${res.before.total} · بعد total=${res.after.total})`); process.exit(0); }
  console.error("✗ (--broken) المخرج لم يختلف — لا أسنان."); process.exit(1);
}
if (!identical) fails.push(`المخرج تغيّر بوجود بيانات الحراج: total ${res.before.total}→${res.after.total} · codes «${res.before.codes}»→«${res.after.codes}»`);
if (res.after.codes.includes("HX")) fails.push("🚨 كود الحراج HX في مخرج زد");
if (fails.length) { console.error("✗ G-ZID-OUTPUT:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-ZID-OUTPUT: مخرج زد متطابق قبل/بعد بيانات الحراج (total=${res.after.total} · نفس الأكواد) — الملفّان ثابتان.`);
