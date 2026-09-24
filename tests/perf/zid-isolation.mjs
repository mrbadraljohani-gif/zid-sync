// ============================================================================
// G-ZID-ISOLATION — رفع فرع حراج يكتب في sales_branch_items وحده (القيمة، لا الشكل):
//   syncInventoryToDB("xbranch",…) ⇒ كل عمليات bulkUpsert/removeCodes/getAllCodes على "sales_branch_items"
//   فقط · 🚫 لا لمسة واحدة لـ branch_items/warehouse_items (عزل زد). location الحركة = الرمز الثابت.
// --broken: INV_TABLE.xbranch = "branch_items" ⇒ الكتابة تصيب branch_items ⇒ يرسب.
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
  const A = 'const INV_TABLE = { wh: "warehouse_items", branch: "branch_items", xbranch: "sales_branch_items" };';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد INV_TABLE"); process.exit(2); }
  html = html.replace(A, 'const INV_TABLE = { wh: "warehouse_items", branch: "branch_items", xbranch: "branch_items" };');   // يوجّه الحراج لجدول زد
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; sb = {}; invBranches = [];
  const tablesWritten = new Set(), movLocs = new Set();
  // نراقب كل مسّ للجداول عبر db.inventory + تسجيل الحركات
  db.inventory.getAllCodes = async (table) => { tablesWritten.add("read:" + table); return []; };
  db.inventory.bulkUpsert = async (table) => { tablesWritten.add("write:" + table); };
  db.inventory.removeCodes = async (table) => { tablesWritten.add("del:" + table); };
  db.inventory.setMeta = async () => { tablesWritten.add("write:inventory_sync_meta"); };
  db.branches = { setMeta: async () => { tablesWritten.add("write:branches"); }, getAll: async () => [] };
  db.salesBranches = { lastUploadAt: async () => null, meta: async () => ({}) };
  // اعترض كتابة الحركات لرصد location وجدولها
  const realFrom = (t) => ({ insert: async (rows) => { tablesWritten.add("write:" + t); (Array.isArray(rows) ? rows : [rows]).forEach(r => { if (r && r.location) movLocs.add(r.location); }); return { error: null }; } });
  sb.from = (t) => realFrom(t);
  const agg = [{ code: "M1", name: "منتج", qty: 5, incl: 100, excl: 87, bar: "" }];
  await syncInventoryToDB("xbranch", agg, ["code"], "haraj.xlsx", "haraj_maf");
  return { tables: [...tablesWritten], movLocs: [...movLocs] };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const touchedZid = res.tables.filter(t => /:(branch_items|warehouse_items)$/.test(t));
const touchedXbr = res.tables.some(t => /:sales_branch_items$/.test(t));
if (BROKEN) {
  if (touchedZid.length) { console.log("✅ (--broken) G-ZID-ISOLATION مسك العطل: الحراج مسّ جدول زد — " + touchedZid.join(",")); process.exit(0); }
  console.error("✗ (--broken) لم يمسّ جدول زد — لا أسنان."); process.exit(1);
}
const BRANCH_ITEMS_REF = 6653;   // العدد الحيّ لفرعَي زد (الخضرة 3328 ＋ العزيزية 3325) — رفع الحراج لا يمسّه
if (touchedZid.length) fails.push("🚨 رفع الحراج مسّ جدول زد: " + touchedZid.join(","));
if (!touchedXbr) fails.push("لم يُكتب في sales_branch_items إطلاقاً: " + res.tables.join(","));
if (!res.movLocs.includes("haraj_maf") || res.movLocs.length !== 1) fails.push(`location الحركة ليس الرمز الثابت وحده: ${res.movLocs.join(",")}`);
if (fails.length) { console.error("✗ G-ZID-ISOLATION:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-ZID-ISOLATION: رفع الحراج مسّ sales_branch_items فقط (صفر مسّ لـbranch_items ⇒ العدد الحيّ ${BRANCH_ITEMS_REF} ثابت) · location الحركة = haraj_maf.`);
