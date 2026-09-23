// ============================================================================
// G-YESTERDAY — زرّ الفترة يُسمّى بيوم العمل: «أمس» لا «اليوم» (القيمة، لا الشكل):
//   نافذة period="today" تستهدف business_date ليوم أمس بالضبط —
//   رفعة اليوم (business=أمس) داخلها · رفعة أمس (business=أول أمس) خارجها.
//   والتسمية في SALES_PERIODS = «أمس». ولا يُمَسّ 7/30/سنة.
// --broken: since = بداية اليوم الرياضيّ (يوم الرفعة) بدل أمس ⇒ رفعة اليوم تخرج (business=أمس<اليوم) ⇒ يرسب.
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
  const A = 'if (period === "today") { since = Date.parse(shiftYmd(riyadhDay(now), -1) + "T00:00:00+03:00"); span = day; }';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد نافذة أمس"); process.exit(2); }
  html = html.replace(A, 'if (period === "today") { since = Date.parse(riyadhDay(now) + "T00:00:00+03:00"); span = day; }');   // يوم الرفعة لا أمس
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  const day = 86400000, now = Date.now(), iso = t => new Date(t).toISOString();
  // رفعة «اليوم» (قبل ساعتين) ⇒ business = أمس · رفعة «أمس» (قبل 26 ساعة) ⇒ business = أول أمس
  const capToday = iso(now - 2 * 3600000), capYest = iso(now - 26 * 3600000);
  const bizToday = salesBizDate(capToday), bizYest = salesBizDate(capYest);
  const { sinceIso, prevSinceIso } = salesRange("today");
  const since = Date.parse(sinceIso);
  const inToday = salesBizTs(capToday) >= since;     // رفعة اليوم (business=أمس) يجب أن تدخل
  const inYest = salesBizTs(capYest) >= since;        // رفعة أمس (business=أول أمس) يجب أن تخرج
  const yesterdayMidnight = Date.parse(salesBizDate(capToday) + "T00:00:00+03:00");
  const label = SALES_PERIODS.find(x => x[0] === "today")[1];
  const others = SALES_PERIODS.filter(x => ["7", "30", "365"].includes(x[0])).map(x => x[1]);
  return { inToday, inYest, sinceMatchesYesterday: since === yesterdayMidnight, label, others, bizToday, bizYest };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  if (res.label !== "أمس") fails.push(`تسمية الزرّ ليست «أمس»: «${res.label}»`);
  if (!res.sinceMatchesYesterday) fails.push("نافذة «أمس» لا تبدأ من منتصف ليل business_date أمس");
  if (!res.inToday) fails.push("رفعة اليوم (business=أمس) خارج نافذة «أمس» — خطأ");
  if (res.inYest) fails.push("رفعة أمس (business=أول أمس) داخل نافذة «أمس» — يجب أن تخرج");
  if (res.others.join("|") !== "7 أيام|30 يوماً|سنة") fails.push(`مدد 7/30/سنة تغيّرت: ${JSON.stringify(res.others)}`);
}
if (BROKEN) {
  if (fails.length || !res.inToday === false) { /* placeholder */ }
  if (fails.length || res.inToday === false) { console.log("✅ (--broken) G-YESTERDAY مسك العطل: نافذة يوم الرفعة تُخرج رفعة اليوم (business=أمس)"); process.exit(0); }
  console.error("✗ (--broken) رفعة اليوم بقيت داخل النافذة — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-YESTERDAY:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-YESTERDAY: «أمس» تسميةً ونافذةً (business_date أمس) — رفعة اليوم داخلها ورفعة أمس خارجها؛ 7/30/سنة سليمة.");
