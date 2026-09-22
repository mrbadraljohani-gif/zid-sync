// ============================================================================
// G-VALVE-MOVE — صمّام الرفعة الشاذّة (لوحة المبيعات): يوقف/يوسم **التسجيل** لا الرفعة.
//   moveIsAnomaly (نقيّ): 8%＋أرضية 10 ⇒ يُطلق: 10/100·150/1000·481/3200 · يمرّ: 2/100·9/100 (أرضية)·12/1000·73/3339.
//   recordMovements عند الشذوذ: «موافق» ⇒ **يسجّل الحركات ويوسم الرفعة suspect=true** (لا تخطٍّ — لا فقد) ·
//     «إلغاء» ⇒ تخطٍّ نهائيّ (رأس فقط بملاحظة، بلا حركات).
// --broken: يرفع العتبة إلى 60% ⇒ 150/1000 (15%) لا يُعدّ شاذّاً ⇒ يرسب.
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
  const A = "const MOVE_VALVE_PCT = 8, MOVE_VALVE_FLOOR = 10;";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد ثابتَي الصمّام"); process.exit(2); }
  html = html.replace(A, "const MOVE_VALVE_PCT = 60, MOVE_VALVE_FLOOR = 10;");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  // ① نقيّ
  const A = (d, pr) => moveIsAnomaly(d, pr);
  const anom = { stop10: A(10, 100), stop15: A(150, 1000), stop481: A(481, 3200), pass2: A(2, 100), pass9: A(9, 100), pass12: A(12, 1000), pass73: A(73, 3339) };
  // ② تكامل: رفعة شاذّة (20 اختفاء من 20 = 100%) — «موافق» يسجّل ويوسم · «إلغاء» يتخطّى
  dbOnline = true;
  const cap = { uploads: [], movements: [] };
  sb = { from: t => ({ insert: async row => { (t === "sales_uploads" ? cap.uploads : cap.movements).push(row); return { error: null }; } }) };
  const existMap = new Map(); for (let i = 0; i < 20; i++) existMap.set("C" + i, { qty: 5, price_incl: 100, name: "x" });
  const rows = [];   // كلها اختفت ⇒ 100% شاذّ
  window.confirm = () => true;
  cap.uploads = []; cap.movements = [];
  await recordMovements("U-OK", "wh", existMap, rows, null, "f.xlsx", null);
  const okUp = cap.uploads[0] || {}, okMovs = cap.movements.length;
  window.confirm = () => false;
  cap.uploads = []; cap.movements = [];
  await recordMovements("U-NO", "wh", existMap, rows, null, "f.xlsx", null);
  const noUp = cap.uploads[0] || {}, noMovs = cap.movements.length;
  return { anom, okSuspect: okUp.suspect, okMovs, noSuspect: noUp.suspect, noMovs, noNote: noUp.note || "" };
});
await b.close();
const fails = [];
const a = res.anom;
for (const k of ["stop10", "stop15", "stop481"]) if (!a[k]) fails.push(`${k}: كان يجب أن يُعدّ شاذّاً`);
for (const k of ["pass2", "pass9", "pass12", "pass73"]) if (a[k]) fails.push(`${k}: عُدّ شاذّاً (إنذار كاذب)`);
if (!BROKEN) {
  if (res.okSuspect !== true) fails.push("«موافق» لم يوسم الرفعة suspect=true");
  if (!(res.okMovs > 0)) fails.push("«موافق» لم يسجّل الحركات (فقدها بدل وسمها)");
  if (res.noSuspect === true) fails.push("«إلغاء» وسم suspect (يجب تخطٍّ لا وسم)");
  if (res.noMovs !== 0) fails.push("«إلغاء» سجّل حركات (يجب تخطّيها)");
  if (!/تُخطّي/.test(res.noNote)) fails.push("«إلغاء» بلا ملاحظة تخطٍّ في رأس الرفعة");
}
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-VALVE-MOVE مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد رفع العتبة — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-VALVE-MOVE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-VALVE-MOVE: 8%＋أرضية 10 — الشاذّ «موافق» يسجّل ويوسم suspect (لا فقد) · «إلغاء» يتخطّى · الطبيعي يمرّ.");
