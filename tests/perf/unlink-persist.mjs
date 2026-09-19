// ============================================================================
// G-UNLINK-PERSIST (H1) — إلغاء الربط دائم عبر إعادة التحميل، بمصدر واحد: القاعدة.
//   dbDelMapping يجب أن: يحذف من matchedHistory (ذاكرة) ＋ **من القاعدة** (db.matchedHistory.remove) ＋ من bootLocalMap.
//   ⇒ إعادة التحميل الحقيقية = loadMatchedHistoryFromDB (يستبدل الذاكرة من القاعدة) لا تُعيد الصنف ⇒ «يحتاج ربط» لا تصفير.
//   (المنطق القديم — اتحاد ملف الريبو ∪ HIST_KEY — أُزيل في H1؛ لا ملف/localStorage لتاريخ المطابقة بعد اليوم.)
// --broken: يعطّل حذف matchedHistory في dbDelMapping ⇒ يبقى في القاعدة ⇒ إعادة التحميل تُعيده ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  const FIX = 'if (matchedHistory.has(sk)) { matchedHistory.delete(sk); try { await db.matchedHistory.remove(sk); } catch (e) { console.warn("matched_history remove:", e); } }';
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد حذف matchedHistory في dbDelMapping"); process.exit(2); }
  html = html.replace(FIX, "/* حذف matchedHistory مُعطّل (المعطوب) */");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const server = createServer((req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("http://127.0.0.1:" + port)) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
const res = await p.evaluate(async () => {
  // بيئة: متصل، مالك، ومتجر قاعدة وهمي لتاريخ المطابقة يعكس الحذف فعلاً (المصدر الوحيد بعد H1)
  const _hist = new Set(["W", "KEEP1"]);
  sb = {}; dbOnline = true; myRole = "owner";
  db.matchedHistory = {
    async getAll() { return [..._hist]; },
    async bulkUpsert(skus) { skus.forEach(s => _hist.add(String(s))); },
    async remove(sku) { _hist.delete(String(sku)); },
    async bulkRemove(skus) { skus.forEach(s => _hist.delete(String(s))); },
  };
  db.mappings = { remove: async () => ({}) }; db.activity = { insert: async () => {} };
  // صنف W مربوط يدوياً بكود غائب، وفي تاريخ المطابقة (ذاكرة ＋ قاعدة) ＋ بذرة الترحيل المحلية
  manualMap = { "W": "MISSINGCODE" };
  matchedHistory = new Set(["W", "KEEP1"]);
  bootLocalMap = { "W": "MISSINGCODE" };
  unlinkedSet = new Set();
  await dbDelMapping("W");
  const inHistAfter = matchedHistory.has("W");                              // ذاكرة: W محذوف
  const inDbAfter = (await db.matchedHistory.getAll()).includes("W");       // قاعدة: W محذوف فعلاً
  const keepInDb = (await db.matchedHistory.getAll()).includes("KEEP1");    // KEEP1 لم يُمَسّ
  const inSeedAfter = !!(bootLocalMap && bootLocalMap["W"]);                // bootLocalMap نُظّف ⇒ migrateBar لا يعرضه
  // إعادة التحميل الحقيقية = loadMatchedHistoryFromDB (يستبدل الذاكرة من القاعدة — لا ملف/localStorage)
  await loadMatchedHistoryFromDB();
  const wAfterReload = matchedHistory.has(normCode("W"));                   // يجب false (القاعدة لا تذكره) — الدوام
  const keepAfterReload = matchedHistory.has(normCode("KEEP1"));            // يجب true
  return { inHistAfter, inDbAfter, keepInDb, inSeedAfter, wAfterReload, keepAfterReload };
});
await b.close(); server.close();
const fails = [];
if (res.inHistAfter !== false) fails.push("لم يُحذف من matchedHistory في الذاكرة");
if (res.inDbAfter !== false) fails.push("لم يُحذف من القاعدة (db.matchedHistory.remove لم يُستدعَ)");
if (res.keepInDb !== true) fails.push("KEEP1 اختفى من القاعدة — الحذف طال غير المقصود");
if (res.inSeedAfter !== false) fails.push("لم يُحذف من bootLocalMap ⇒ migrateBar يعرض إعادة استيراد المحذوف");
if (res.wAfterReload !== false) fails.push("W عاد بعد إعادة التحميل (loadMatchedHistoryFromDB) — الحذف من القاعدة لم يُطبَّق ⇒ سيُصفَّر «غائباً»");
if (res.keepAfterReload !== true) fails.push("KEEP1 لم يعد بعد إعادة التحميل — القاعدة مصدر ناقص");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-UNLINK-PERSIST مسك العلّة: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد تعطيل حذف matchedHistory — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-UNLINK-PERSIST:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-UNLINK-PERSIST: dbDelMapping يحذف matchedHistory من الذاكرة ＋ القاعدة ＋ bootLocalMap؛ وإعادة التحميل (loadMatchedHistoryFromDB) تُبقي W خارجاً و KEEP1 داخلاً — المصدر الوحيد هو القاعدة (لا ملف/localStorage).");
