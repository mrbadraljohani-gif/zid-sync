// ============================================================================
// G1 (دفعة ١أ) — عزل حذف الفرع: رفع ملف فرع B يحذف الأكواد الناقصة **داخل B فقط**
//   ولا يمسّ صفّاً واحداً من فرع A. (شرط القبول الذي لا تفاوض فيه.)
// الحادثة الأصل: الخانة المشتركة بمفتاح code وحيد ⇒ حذف الفرع يمحو أكواد فرع آخر.
// الإصلاح: مفتاح مركّب (branch_id, code) + getAllCodes/removeCodes محصوران بـbranch_id.
// يتحقّق: بعد رفع فرع B أصغر ⇒ صفوف B تنكمش (حذف داخليّ سليم) · صفوف A كما هي تماماً.
// --broken: يزيل تحجيم getAllCodes/removeCodes (سلوك المفتاح الوحيد) ⇒ صفوف A تُمحى ⇒ يرسب.
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
  // أزِل التحجيم: getAllCodes يرى كل الفروع · removeCodes يحذف بالكود عبر كل الفروع (سلوك ما قبل المفتاح المركّب)
  const G = 'const existRows = await db.inventory.getAllCodes(table, scope);';
  const R = 'await db.inventory.removeCodes(table, toDelete, scope);';
  if (!html.includes(G) || !html.includes(R)) { console.error("✗ (--broken) لم أجد نداءات التحجيم لتعطيلها"); process.exit(2); }
  html = html.replace(G, 'const existRows = await db.inventory.getAllCodes(table, null);')
             .replace(R, 'await db.inventory.removeCodes(table, toDelete, null);');
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  const BA = "branch-A-uuid", BB = "branch-B-uuid";
  // متجر مُفهرَس بـ(branch_id, code) — يحاكي المفتاح المركّب في القاعدة
  const store = new Map();   // "bid||code" -> row
  const put = (bid, code) => store.set(bid + "||" + code, { branch_id: bid, code: String(code) });
  for (let i = 0; i < 50; i++) put(BA, "A" + i);   // فرع A: 50 كوداً
  for (let i = 0; i < 30; i++) put(BB, "B" + i);   // فرع B: 30 كوداً
  const countIn = bid => [...store.keys()].filter(k => k.startsWith(bid + "||")).length;
  db.inventory = {
    getAllCodes: async (t, branchId) => [...store.values()].filter(r => !branchId || r.branch_id === branchId).map(r => ({ code: r.code, qty: r.qty })),   // ＋qty بعد الإثراء (لوحة المبيعات)
    bulkUpsert: async (t, rows) => { rows.forEach(r => store.set((r.branch_id || "") + "||" + r.code, r)); },
    removeCodes: async (t, codes, branchId) => {
      const cs = new Set(codes.map(String));
      for (const k of [...store.keys()]) { const r = store.get(k); if (cs.has(r.code) && (!branchId || r.branch_id === branchId)) store.delete(k); }
    },
    setMeta: async () => {},
  };
  db.branches = { getAll: async () => [{ id: BA, item_count: countIn(BA) }, { id: BB, item_count: countIn(BB) }], setMeta: async () => {}, create: async () => {}, remove: async () => {} };
  const beforeA = countIn(BA), beforeB = countIn(BB);
  // ارفع لفرع B ملفاً أصغر (B0..B9 فقط) — 20 كوداً ناقصة داخل B، وكل A ناقص عن ملف B
  const smallerB = Array.from({ length: 10 }, (_, i) => ({ code: "B" + i, name: "n", qty: 1, incl: 10 }));
  const r = await syncInventoryToDB("branch", smallerB, ["رقم الصنف"], "b.xlsx", BB);
  return { beforeA, afterA: countIn(BA), beforeB, afterB: countIn(BB), deleted: r.deleted };
});
await b.close();
const fails = [];
// شرط العزل الأصمّ: فرع A لم يُمسّ
if (res.afterA !== res.beforeA) fails.push(`فرع A تغيّر: ${res.beforeA}→${res.afterA} (رفع فرع B مسّ فرعاً آخر — انتهاك العزل)`);
// فرع B: حذف داخليّ سليم (30→10, deleted=20)
if (res.afterB !== 10) fails.push(`فرع B لم ينكمش صحيحاً: ${res.beforeB}→${res.afterB} (متوقّع 10)`);
if (res.deleted !== 20) fails.push(`فرع B أبلغ عن حذف ${res.deleted} (متوقّع 20 داخل B)`);
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G1 مسك انتهاك العزل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إزالة التحجيم — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G1 عزل الفرع:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G1: رفع فرع B (${res.beforeB}→${res.afterB}, deleted=${res.deleted}) لم يمسّ فرع A (${res.beforeA}→${res.afterA}) — العزل مصمود.`);
