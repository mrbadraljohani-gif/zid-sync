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
  // صنف W مربوط يدوياً بكود غائب، وفي matchedHistory ＋ بذرة الترحيل المحلية
  manualMap = { "W": "MISSINGCODE" };
  matchedHistory = new Set(["W"]);
  bootLocalMap = { "W": "MISSINGCODE" };
  dbMappings = []; unlinkedSet = new Set();
  let saved = false; saveMatchedHistory = () => { saved = true; };   // نتأكّد أنّ الحذف يُحفَظ (دوام عبر HIST_KEY)
  await dbDelMapping("W");
  const inHistAfter = matchedHistory.has("W");
  const inSeedAfter = !!(bootLocalMap && bootLocalMap["W"]);
  const histSaved = saved;
  // حاكِ إعادة التحميل: unlinkedSet يضيع، manualMap يُعاد بناؤه من القاعدة (فارغة)
  unlinkedSet = new Set(); manualMap = {};
  // القرار الحاسم (سطر 4416): hasHistory = (manualMap||matchedHistory) && !unlinkedSet
  const hasHistoryAfterReload = (!!manualMap["W"] || matchedHistory.has("W")) && !unlinkedSet.has("W");
  // migrateBar بعد الحذف: bootLocalMap فارغ ⇒ لا ترحيل
  const migMapPending = (typeof migPending === "function") ? migPending().some(x => x.type === "map") : (Object.keys(bootLocalMap || {}).length > 0);
  return { inHistAfter, inSeedAfter, histSaved, hasHistoryAfterReload, migMapPending };
});
await b.close(); server.close();
const fails = [];
if (res.inHistAfter !== false) fails.push("لم يُحذف من matchedHistory ⇒ سيعود «غائباً» بعد إعادة التحميل");
if (res.histSaved !== true) fails.push("لم يُستدعَ saveMatchedHistory ⇒ الحذف لا يدوم عبر إعادة التحميل");
if (res.inSeedAfter !== false) fails.push("لم يُحذف من bootLocalMap ⇒ migrateBar يعرضه");
if (res.hasHistoryAfterReload !== false) fails.push("🚨 بعد إعادة التحميل: hasHistory=true ⇒ يُصنَّف «غائباً» ⇒ تصفير (العلّة الأصل)");
if (res.migMapPending !== false) fails.push("migrateBar يعرض إعادة استيراد المحذوف");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-UNLINK-PERSIST مسك العلّة: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد تعطيل حذف matchedHistory — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-UNLINK-PERSIST:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-UNLINK-PERSIST: الإلغاء يحذف من matchedHistory (＋يحفظ) ＋ bootLocalMap ⇒ بعد إعادة التحميل «يحتاج ربط» لا «غائب»، وبلا بانر ترحيل.");
