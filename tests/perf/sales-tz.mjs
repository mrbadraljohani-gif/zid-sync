// ============================================================================
// G-TZ — اليوم التقويميّ يُشتقّ بتوقيت الرياض (UTC+3) لا UTC ولا متصفّح القارئ (القيمة، لا الشكل):
//   captured=2026-09-24T00:30:00Z (=3:30 فجر 24 بالرياض) ⇒ business_date=2026-09-23 (لا 09-22).
//   captured=2026-09-23T21:00:00Z (=00:00 منتصف ليل 24 بالرياض) ⇒ business_date=2026-09-23.
// --broken: salesBizDate يشتقّ بـUTC (slice ثم −يوم) بلا +3س ⇒ 00:30Z ⇒ 09-22 خطأً ⇒ يرسب.
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
  const A = "function salesBizDate(ts) { const t = Date.parse(ts); if (!Number.isFinite(t)) return \"\"; const d = new Date(t + SALES_TZ_OFF); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد salesBizDate"); process.exit(2); }
  html = html.replace(A, "function salesBizDate(ts) { const t = Date.parse(ts); if (!Number.isFinite(t)) return \"\"; const d = new Date(t); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }   // (--broken) UTC بلا +3س");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => ({
  earlyMorning: salesBizDate("2026-09-24T00:30:00Z"),   // 3:30 فجر 24 بالرياض ⇒ 09-23
  midnight: salesBizDate("2026-09-23T21:00:00Z"),       // 00:00 منتصف ليل 24 بالرياض ⇒ 09-23
  riyadhDayEarly: riyadhDay("2026-09-24T00:30:00Z"),    // 09-24 بالرياض
}));
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  if (res.earlyMorning !== "2026-09-23") fails.push(`00:30Z (3:30 فجر بالرياض): توقّعت business_date=2026-09-23، وجدت «${res.earlyMorning}»`);
  if (res.midnight !== "2026-09-23") fails.push(`21:00Z (منتصف ليل بالرياض): توقّعت 2026-09-23، وجدت «${res.midnight}»`);
  if (res.riyadhDayEarly !== "2026-09-24") fails.push(`riyadhDay(00:30Z): توقّعت 2026-09-24، وجدت «${res.riyadhDayEarly}»`);
}
if (BROKEN) {
  // الحالة المميِّزة: 21:00Z (منتصف ليل 24 بالرياض) — UTC يعطي 09-22 خطأً بدل 09-23
  if (res.midnight === "2026-09-22") { console.log("✅ (--broken) G-TZ مسك العطل: الاشتقاق بـUTC أعطى 09-22 بدل 09-23 (منتصف ليل الرياض)"); process.exit(0); }
  console.error("✗ (--broken) لم ينزلق اليوم بـUTC — لا أسنان (midnight=" + res.midnight + ")."); process.exit(1);
}
if (fails.length) { console.error("✗ G-TZ:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-TZ: اليوم التقويميّ بتوقيت الرياض (UTC+3) — فجر/منتصف ليل الرياض يُنسبان لليوم الصحيح.");
