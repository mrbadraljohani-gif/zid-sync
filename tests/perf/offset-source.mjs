// ============================================================================
// G-OFFSET-SOURCE (H2) — زيادات الأسعار مصدرها القاعدة وحدها. loadConfig لا يضعها في الحيّ (بذرة ترحيل فقط).
//   يشغّل loadConfig() الحقيقية على خادم فعليّ (price-offsets.json مخدوم ＋ OFF_KEY مضبوط):
//     • بعد loadConfig: priceOffsets **فارغ** (الحيّ) · bootLocalOffsets يحمل البذرة (ملف ∪ localStorage).
//   ثم loadPriceOffsetsFromDB (قاعدة وهمية): يستبدل الذاكرة بصفوف القاعدة · القاعدة فارغة+بذرة ⇒ ترحيل تلقائيّ (bulkUpsert).
// --broken: يعيد وضع البذرة في priceOffsets داخل loadConfig ⇒ الحيّ غير فارغ ⇒ يرسب.
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
  const ANCHOR = "bootLocalOffsets[normCode(k)] = Math.round(v);";
  if (!html.includes(ANCHOR)) { console.error("✗ (--broken) لم أجد سطر بذرة الزيادات في loadConfig"); process.exit(2); }
  html = html.replace(ANCHOR, "priceOffsets[normCode(k)] = Math.round(v);");   // العطل: البذرة تتسرّب للحيّ (الاتحاد القديم)
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const server = createServer((req, res) => {
  const u = (req.url || "/").split("?")[0];
  if (u === "/price-offsets.json") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ "80151.2": 180 })); }
  if (u === "/version.txt") { res.setHeader("Content-Type", "text/plain"); return res.end("test"); }
  res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("http://127.0.0.1:" + port)) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
const res = await p.evaluate(async () => {
  // (١) OFF_KEY محلّي ثم loadConfig الحقيقية — يجب ألّا يتسرّب أيٌّ منهما إلى priceOffsets (الحيّ)
  localStorage.setItem(OFF_KEY, JSON.stringify({ "99": 50 }));
  await loadConfig();
  const liveAfterLoadConfig = { ...priceOffsets };                 // يجب {}
  const seed = { ...bootLocalOffsets };                            // يجب {80151.2:180, 99:50}

  // (٢) القاعدة مصدر الحقيقة: تستبدل الذاكرة
  sb = {};
  db.priceOffsets = { async getAll() { return [{ sku: "77", value: 30 }]; }, async bulkUpsert() {} };
  await loadPriceOffsetsFromDB();
  const afterDb = { ...priceOffsets };                             // يجب {77:30}

  // (٣) القاعدة فارغة + بذرة ⇒ ترحيل تلقائيّ (bulkUpsert يُستدعى بالبذرة)
  let upserted = null; const store = [];
  db.priceOffsets = { async getAll() { return store.slice(); }, async bulkUpsert(rows) { upserted = rows.map(r => ({ ...r })); rows.forEach(r => store.push({ sku: r.sku, value: r.value })); } };
  bootLocalOffsets = { "80151.2": 180, "99": 50 };
  await loadPriceOffsetsFromDB();
  const afterMigrate = { ...priceOffsets };                        // يجب {80151.2:180, 99:50}
  return { liveAfterLoadConfig, seed, afterDb, afterMigrate, upsertedN: upserted ? upserted.length : 0 };
});
await b.close(); server.close();
const fails = [];
const eq = (a, b2) => JSON.stringify(a) === JSON.stringify(b2);
if (Object.keys(res.liveAfterLoadConfig).length !== 0) fails.push("loadConfig سرّب زيادات للحيّ: " + JSON.stringify(res.liveAfterLoadConfig) + " (يجب {} — المصدر القاعدة)");
if (!(res.seed["80151.2"] === 180 && res.seed["99"] === 50)) fails.push("bootLocalOffsets لا يحمل البذرة (ملف ∪ localStorage): " + JSON.stringify(res.seed));
if (!eq(res.afterDb, { "77": 30 })) fails.push("loadPriceOffsetsFromDB لم يستبدل الذاكرة بصفوف القاعدة: " + JSON.stringify(res.afterDb));
if (res.upsertedN !== 2) fails.push("الترحيل التلقائيّ لم يرفع البذرة (bulkUpsert=" + res.upsertedN + " ≠ 2)");
if (!eq(res.afterMigrate, { "80151.2": 180, "99": 50 })) fails.push("بعد الترحيل الذاكرة ≠ البذرة: " + JSON.stringify(res.afterMigrate));
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-OFFSET-SOURCE مسك التسرّب: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إعادة تسريب البذرة — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-OFFSET-SOURCE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-OFFSET-SOURCE: loadConfig لا يضع الزيادات في الحيّ (بذرة فقط) · loadPriceOffsetsFromDB يستبدل من القاعدة · القاعدة فارغة+بذرة ⇒ ترحيل تلقائيّ.");
