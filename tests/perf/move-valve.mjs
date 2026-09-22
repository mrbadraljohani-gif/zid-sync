// ============================================================================
// G-VALVE-MOVE — صمّام الرفعة الشاذّة (لوحة المبيعات): يوقف **التسجيل** لا الرفعة.
//   العتبة 8% ＋ أرضية 10 (مقيستان من بيانات المستخدم). يُطلق confirm فوقهما فقط.
//   يُطلق: (10/100=10%) · (150/1000=15%) · (481/3200≈15%)
//   يمرّ بلا confirm: (2/100 دون الأرضية) · (9/100 دون الأرضية) · (12/1000=1.2% فوق الأرضية دون العتبة) · (73/3339=2.1% طبيعي)
//   والعزل: recordMovements عند فشل الصمّام يُدرج رأس الرفعة فقط لا الحركات؛ والرفع (bulkUpsert) قبله مستقلّ.
// --broken: يرفع العتبة إلى 60% ⇒ 15% لا يُطلق confirm ⇒ يرسب.
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
const res = await p.evaluate(() => {
  const calls = [];
  window.confirm = (msg) => { calls.push(msg); return true; };   // نرصد الاستدعاء (المتابعة true لا تهمّ — المهمّ: هل سأل؟)
  const trial = (dis, prev) => { const before = calls.length; const ok = moveValveOk(dis, prev); return { asked: calls.length > before, ok }; };
  return {
    stop10:  trial(10, 100),     // 10% ≥ 8 · فوق الأرضية ⇒ يسأل
    stop15:  trial(150, 1000),   // 15% ⇒ يسأل
    stop481: trial(481, 3200),   // ≈15% ⇒ يسأل
    pass2:   trial(2, 100),      // دون الأرضية (2<10) ⇒ لا يسأل
    pass9:   trial(9, 100),      // دون الأرضية (9<10) ⇒ لا يسأل
    pass12:  trial(12, 1000),    // 1.2% فوق الأرضية دون العتبة ⇒ لا يسأل
    pass73:  trial(73, 3339),    // 2.1% طبيعي ⇒ لا يسأل
    msg: calls[0] || "",
  };
});
await b.close();
const fails = [];
const mustStop = { stop10: res.stop10, stop15: res.stop15, stop481: res.stop481 };
const mustPass = { pass2: res.pass2, pass9: res.pass9, pass12: res.pass12, pass73: res.pass73 };
for (const [k, v] of Object.entries(mustStop)) if (!v.asked) fails.push(`${k}: كان يجب أن يُطلق confirm (اختفاء شاذّ) فلم يفعل`);
for (const [k, v] of Object.entries(mustPass)) if (v.asked) fails.push(`${k}: أطلق confirm على رفعة طبيعية (إنذار كاذب)`);
// النصّ يقول ماذا/لماذا/ما العمل بالأرقام
if (!BROKEN && res.stop15.asked && !(/\d+ اختفاء/.test(res.msg) && /%/.test(res.msg) && /سجلّ المبيعات/.test(res.msg))) fails.push("نصّ الصمّام لا يذكر العدد/النسبة/أنه يخصّ سجلّ المبيعات");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-VALVE-MOVE مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد رفع العتبة — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-VALVE-MOVE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-VALVE-MOVE: 8%＋أرضية 10 — يوقف التسجيل عند الشذوذ (10%/15%) ويمرّ الطبيعي (2.1%/دون الأرضية)، بنصّ بالأرقام.");
