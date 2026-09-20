// ============================================================================
// G-WAIT-DECIDE — «غير متوفر» قرار تصنيف يُخلي «يحتاج ربط»، فاعل دائماً (حتى لصنف مصفّر ومخفيّ في زد أصلاً):
//   ① الزرّ فاعل (بلا disabled) ＋ ملاحظة «يُسجَّل قراراً» لصنف كمية 0/غير منشور.
//   ② الضغط (markWaiting) يُدخله waitingSet (⇒ okItem يُخرجه من «يحتاج ربط») ويُحفظ في القاعدة.
// --broken: يعيد تعطيل الزرّ عند انعدام الأثر ⇒ الزرّ disabled ⇒ يرسب.
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
  const ANCHOR = '<button class="mc-btn wait" onclick="batchExclude(\'${uid}\',\'wait\')" title="${noop ?';
  if (!html.includes(ANCHOR)) { console.error("✗ (--broken) لم أجد سطر زرّ الانتظار"); process.exit(2); }
  html = html.replace(ANCHOR, '<button class="mc-btn wait" ${noop ? "disabled" : ""} onclick="batchExclude(\'${uid}\',\'wait\')" title="${noop ?');
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
  sb = { from: () => ({ upsert: async () => ({ error: null }), delete() { return this; }, eq: async () => ({ error: null }) }) };
  dbOnline = true; myRole = "owner"; famIndex = null;
  db.waiting = { upsert: async () => {} }; db.activity = { insert: async () => {} };
  // صنف مصفّر ومخفيّ في زد أصلاً، بلا مرشّح
  const r = { z: { sku: "Z0", skuN: "Z0", qty: 0, price: 100, published: "No", name: "صنف مصفّر", img: "" }, best: null };
  let card = "", threw = "";
  try { card = batchCardHTML(r, "bt-r", ""); } catch (e) { threw = String(e); }
  const enabled = /class="mc-btn wait" onclick="batchExclude/.test(card) && !/class="mc-btn wait"[^>]*\bdisabled\b/.test(card);
  const hasNote = card.includes("wait-note");
  // ② القرار: markWaiting ⇒ waitingSet
  waitingSet = new Set();
  let decErr = "";
  try { await markWaiting("Z0", "Z0", "صنف مصفّر"); } catch (e) { decErr = String(e); }
  const inWaiting = waitingSet.has(normCode("Z0"));
  return { threw, enabled, hasNote, inWaiting, decErr };
});
await b.close(); server.close();
const fails = [];
if (res.threw) fails.push("batchCardHTML رمى: " + res.threw);
if (!res.enabled) fails.push("① زرّ «غير متوفر» مُعطَّل لصنف مصفّر/مخفيّ — يجب أن يكون فاعلاً (قرار تصنيف)");
if (!res.hasNote) fails.push("① لا ملاحظة «يُسجَّل قراراً» على الصنف المعدوم الأثر");
if (res.decErr) fails.push("② markWaiting رمى: " + res.decErr);
if (!res.inWaiting) fails.push("② بعد «غير متوفر» لم يدخل waitingSet (لا يخرج من «يحتاج ربط»)");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-WAIT-DECIDE مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إعادة التعطيل — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-WAIT-DECIDE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-WAIT-DECIDE: زرّ «غير متوفر» فاعل دائماً (بلا disabled) ＋ ملاحظة «يُسجَّل قراراً»؛ والضغط يُدخل waitingSet (يخرج من «يحتاج ربط») ويُحفظ.");
