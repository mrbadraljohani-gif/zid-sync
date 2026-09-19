// ============================================================================
// G-UNLINK-PERSIST — إلغاء الربط دائم عبر إعادة التحميل (لا يعود «غائباً»⇒صفر) ولا يُعرض للترحيل.
//   dbDelMapping يجب أن: يحذف من matchedHistory (＋يحفظ) · يحذف من bootLocalMap · ينظّف MAP_KEY.
//   ⇒ بعد إعادة التحميل: matchedHistory لا يذكره ⇒ hasHistory=false ⇒ «يحتاج ربط» لا تصفير · migrateBar لا يعرضه.
// --broken: يزيل حذف matchedHistory ⇒ يبقى في التاريخ ⇒ (يحاكي إعادة التحميل) يُصنَّف «غائباً» ⇒ يرسب.
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
  const FIX = "if (matchedHistory.has(sk)) { matchedHistory.delete(sk); saveMatchedHistory(); }";
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد حذف matchedHistory"); process.exit(2); }
  html = html.replace(FIX, "/* حذف matchedHistory مُعطّل (المعطوب) */");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const server = createServer((req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); });   // خدمة عبر http فتعمل localStorage
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("http://127.0.0.1:" + port)) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
const res = await p.evaluate(async () => {
  // بيئة: متصل، مالك، قاعدة وهمية تقبل الحذف
  sb = { from: () => ({ delete() { return this; }, eq: async () => ({ error: null }), select() { return this; }, order() { return this; }, range: async () => ({ data: [], error: null }) }) };
  dbOnline = true; myRole = "owner";
  db.mappings = { remove: async () => ({}) }; db.activity = { insert: async () => {} };
  // صنف W مربوط يدوياً بكود غائب، وفي matchedHistory ＋ بذرة الترحيل المحلية ＋ HIST_KEY المحلي
  manualMap = { "W": "MISSINGCODE" };
  matchedHistory = new Set(["W"]);
  bootLocalMap = { "W": "MISSINGCODE" };
  localStorage.setItem(HIST_KEY, JSON.stringify(["W", "KEEP1"]));
  dbMappings = []; unlinkedSet = new Set();
  await dbDelMapping("W");
  const inHistAfter = matchedHistory.has("W");
  const localAfter = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");   // هل HIST_KEY المحلي نُظّف فعلاً؟ (لا وسم مزيّف)
  const inLocalAfter = localAfter.includes("W");
  const inSeedAfter = !!(bootLocalMap && bootLocalMap["W"]);
  // محاكاة إعادة التحميل الحقيقية = loadSet: matchedHistory = **ملف الريبو ∪ HIST_KEY** (سطر 2584)
  const reloadUnion = repoFile => new Set([...(repoFile || []), ...JSON.parse(localStorage.getItem(HIST_KEY) || "[]")].map(x => normCode(x)));
  const wAfterReload_cleanSeed = reloadUnion([]).has(normCode("W"));       // بذرة الريبو نُظّفت ⇒ W خارج
  const wAfterReload_staleSeed = reloadUnion(["W"]).has(normCode("W"));    // بذرة الريبو لم تُنظَّف ⇒ W يعود (التبعية الحاسمة)
  const migMapPending = (typeof migPending === "function") ? migPending().some(x => x.type === "map") : (Object.keys(bootLocalMap || {}).length > 0);
  return { inHistAfter, inLocalAfter, inSeedAfter, wAfterReload_cleanSeed, wAfterReload_staleSeed, migMapPending };
});
await b.close(); server.close();
const fails = [];
if (res.inHistAfter !== false) fails.push("لم يُحذف من matchedHistory في الذاكرة");
if (res.inLocalAfter !== false) fails.push("لم يُنظَّف HIST_KEY المحلي (saveMatchedHistory لم يُطبَّق فعلاً)");
if (res.inSeedAfter !== false) fails.push("لم يُحذف من bootLocalMap ⇒ migrateBar يعرضه");
// ★ الحقيقة (اتحاد loadSet): مع بذرة ريبو نظيفة ⇒ W خارج بعد إعادة التحميل؛ مع بذرة قديمة ⇒ يعود.
if (res.wAfterReload_cleanSeed !== false) fails.push("مع بذرة ريبو نظيفة، W عاد بعد إعادة التحميل — الحذف المحلي لم يُطبَّق");
if (res.wAfterReload_staleSeed !== true) fails.push("التبعية غير مثبتة: بذرة ريبو قديمة يجب أن تُعيد W (يوثّق ضرورة تنظيف الملف / ترحيل matchedHistory للقاعدة)");
if (res.migMapPending !== false) fails.push("migrateBar يعرض إعادة استيراد المحذوف");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-UNLINK-PERSIST مسك العلّة: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد تعطيل حذف matchedHistory — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-UNLINK-PERSIST:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-UNLINK-PERSIST: dbDelMapping ينظّف matchedHistory ＋ HIST_KEY ＋ bootLocalMap؛ وإعادة التحميل (اتحاد loadSet) تُبقي W خارجاً **إن نُظّفت بذرة الريبو** (وإلا تُعيده — تبعية موثّقة: ترحيل matchedHistory للقاعدة هو الحلّ الدائم).");
