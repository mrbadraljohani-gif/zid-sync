// ============================================================================
// G-HIST-SOURCE (H1) — تاريخ المطابقة مصدره القاعدة وحدها. loadConfig لا يقرأه من ملف/localStorage.
//   يشغّل loadConfig() **الحقيقية** على خادم فعليّ (لا مسح ذاكرة — لا نكرّر جوف G-UNLINK-PERSIST القديم):
//     • matched-history.json مخدوم ＋ HIST_KEY مضبوط في localStorage ⇒ بعد loadConfig يجب أن يبقى matchedHistory **فارغاً**.
//   ثم loadMatchedHistoryFromDB (قاعدة وهمية) ⇒ يستبدل الذاكرة بصفوف القاعدة؛ وفشل الجلب ⇒ histIncomplete=true.
// --broken: يعيد اتحاد loadConfig من HIST_KEY ⇒ matchedHistory غير فارغ بعد loadConfig ⇒ يرسب.
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
  const ANCHOR = "matchedHistory = new Set(); baseHistSet = new Set();";
  if (!html.includes(ANCHOR)) { console.error("✗ (--broken) لم أجد سطر تصفير matchedHistory في loadConfig"); process.exit(2); }
  // العطل: أعِد قراءة HIST_KEY في loadConfig (الاتحاد القديم) ⇒ يعود التسرّب المحلي
  html = html.replace(ANCHOR, 'matchedHistory = new Set((JSON.parse(localStorage.getItem(HIST_KEY)||"[]")||[]).map(normCode)); baseHistSet = new Set();');
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
// خادم يخدم index.html والملفّات الجانبية (matched-history.json موجود عمداً — لإثبات أن loadConfig يتجاهله)
const server = createServer((req, res) => {
  const u = (req.url || "/").split("?")[0];
  if (u === "/matched-history.json") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(["FILE_SKU"])); }
  if (u === "/price-offsets.json") { res.setHeader("Content-Type", "application/json"); return res.end("{}"); }
  if (u === "/version.txt") { res.setHeader("Content-Type", "text/plain"); return res.end("test"); }
  res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("http://127.0.0.1:" + port)) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
const res = await p.evaluate(async () => {
  // (١) اضبط HIST_KEY محلياً ثم شغّل loadConfig الحقيقية — يجب ألّا يتسرّب أيّ منهما إلى matchedHistory
  localStorage.setItem(HIST_KEY, JSON.stringify(["LOCAL_SKU"]));
  await loadConfig();
  const afterLoadConfig = [...matchedHistory];   // يجب [] — لا ملف (FILE_SKU) ولا localStorage (LOCAL_SKU)

  // (٢) القاعدة مصدر الحقيقة: loadMatchedHistoryFromDB يستبدل الذاكرة بصفوف القاعدة
  sb = {}; db.matchedHistory = { async getAll() { return ["DB_SKU", "0DB2"]; } };
  await loadMatchedHistoryFromDB();
  const afterDbLoad = [...matchedHistory].sort();
  const histIncompleteOk = (typeof histIncomplete !== "undefined") ? histIncomplete : null;   // نجاح ⇒ false

  // (٣) فشل جلب القاعدة ⇒ histIncomplete=true (بوّابة الحجب)
  db.matchedHistory = { async getAll() { throw new Error("net"); } };
  await loadMatchedHistoryFromDB();
  const histIncompleteAfterFail = histIncomplete;
  return { afterLoadConfig, afterDbLoad, histIncompleteOk, histIncompleteAfterFail };
});
await b.close(); server.close();
const fails = [];
if (res.afterLoadConfig.length !== 0) fails.push("loadConfig سرّب تاريخاً من ملف/localStorage: " + JSON.stringify(res.afterLoadConfig) + " (يجب [] — المصدر القاعدة وحدها)");
// القاعدة تخزّن skuN مطبَّعاً؛ والتحميل يطبّق normCode ثانيةً (idempotent): "0DB2" ⇒ "DB2". فالمتوقَّع ["DB2","DB_SKU"].
if (JSON.stringify(res.afterDbLoad) !== JSON.stringify(["DB2", "DB_SKU"])) fails.push("loadMatchedHistoryFromDB لم يستبدل الذاكرة بصفوف القاعدة (مطبَّعة): " + JSON.stringify(res.afterDbLoad));
if (res.histIncompleteOk !== false) fails.push("histIncomplete ليس false بعد جلب ناجح");
if (res.histIncompleteAfterFail !== true) fails.push("histIncomplete ليس true بعد فشل الجلب (بوّابة الحجب لا تعمل)");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-HIST-SOURCE مسك التسرّب: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إعادة اتحاد HIST_KEY — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-HIST-SOURCE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-HIST-SOURCE: loadConfig لا يقرأ تاريخ المطابقة من ملف/localStorage (بقي []) · loadMatchedHistoryFromDB يستبدل الذاكرة من القاعدة · فشل الجلب ⇒ histIncomplete.");
