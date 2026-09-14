// ============================================================================
// G0 (دفعة صفرية) — رفع ملف فرع أصغر لا ينقص عدد صفوف branch_items.
// الحادثة: خانة الفرع الواحدة تحذف أكواد الفرع السابق (removeCodes) ⇒ فقدان بيانات.
// الإصلاح: الفرع لا يحذف (يضيف ويحدّث فقط) حتى دعم الفروع المتعدّدة. المستودع يبقى يحذف.
// يتحقّق: بعد مزامنة فرع أصغر ⇒ الجدول لا ينكمش · deleted=0 · وأن المستودع ما زال يحذف.
// --broken: يُعيد حساب toDelete للفرع (سلوك ما قبل الإصلاح) ⇒ الجدول ينكمش ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const FIX = 'const toDelete = kind === "wh" ? existing.filter(c => !newSet.has(c)) : [];';
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد شرط الفرع في toDelete لتعطيله"); process.exit(2); }
  html = html.replace(FIX, "const toDelete = existing.filter(c => !newSet.has(c));");   // أعِد الحذف للفرع
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  const run = async (kind) => {
    const tbl = new Set(Array.from({ length: 100 }, (_, i) => "C" + i));   // 100 كود سابق
    let removed = 0;
    db.inventory = {
      getAllCodes: async () => [...tbl],
      bulkUpsert: async (t, rows) => { rows.forEach(r => tbl.add(String(r.code))); },
      removeCodes: async (t, codes) => { removed += codes.length; codes.forEach(c => tbl.delete(String(c))); },
      setMeta: async () => {},
    };
    try { sb = null; } catch (e) {}
    const smaller = Array.from({ length: 50 }, (_, i) => ({ code: "C" + i, name: "n", qty: 1, incl: 10 }));   // 50 كود (أصغر)
    const before = tbl.size;
    const r = await syncInventoryToDB(kind, smaller, ["رقم الصنف"], "x.xlsx");
    return { before, after: tbl.size, deleted: r.deleted, removed };
  };
  return { branch: await run("branch"), wh: await run("wh") };
});
await b.close();
const fails = [];
// الفرع: لا انكماش · لا حذف
if (res.branch.after < res.branch.before) fails.push(`الفرع انكمش: ${res.branch.before}→${res.branch.after} (حُذفت أكواد فرع سابق)`);
if (res.branch.deleted !== 0 || res.branch.removed !== 0) fails.push(`الفرع أبلغ عن حذف (deleted=${res.branch.deleted}, removeCodes=${res.branch.removed}) — يجب صفر`);
// المستودع: ما زال يحذف (لم أُعطّله)
if (BROKEN) { /* في المعطوب الفرع يحذف؛ لا نفحص المستودع */ }
else if (!(res.wh.after < res.wh.before && res.wh.deleted > 0)) fails.push(`المستودع لم يعد يحذف (after=${res.wh.after}, deleted=${res.wh.deleted}) — يجب أن يبقى حذفه سليماً`);
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G0 مسك حذف الفرع: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إعادة حذف الفرع — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G0 عزل حذف الفرع:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G0: الفرع لا يحذف (${res.branch.before}→${res.branch.after}, deleted=0) · المستودع يحذف (${res.wh.before}→${res.wh.after}, deleted=${res.wh.deleted}).`);
