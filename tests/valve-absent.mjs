// ============================================================================
// G-VALVE (②-ب) — صمّام «updated=0 ＋ تصفير غيابيّ بكثرة».
//   يوقف التنزيل فقط حين updatedCount==0 ∧ absentZeros≥20 (حادثة الملف المعطوب)،
//   لا عند بضعة قرارات (⏳/رخص لا تُحسب) ولا حين يوجد تحديث حقيقيّ.
//   الحالات الثلاث: (أ) 954/600 يمرّ · (ب) 0/852 يوقف · (ج) 0/0 يمرّ.
//   ＋ الحوار يذكر السبب بالأرقام («تم تحديثه 0 … 852 صنفاً»)، و«إلغاء» افتراضيّ.
// --broken: يزيل شرط updatedCount==0 (يوقف على absentZeros وحده) ⇒ الحالة (أ) توقف ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BROKEN = process.argv.includes("--broken");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  const FIX = "if (!(z && z.updatedCount === 0 && (z.absentZeros || 0) >= ABSENT_ZERO_MIN)) return true;";
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد شرط الصمّام"); process.exit(2); }
  html = html.replace(FIX, "if (!(z && (z.absentZeros || 0) >= ABSENT_ZERO_MIN)) return true;");   // يُسقط شرط updatedCount==0
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  const calls = [];
  window.confirm = m => { calls.push(m); return false; };   // المستخدم يلغي (الافتراضي)
  const gate = z => absentZeroGateOk(z);   // true = يمرّ · false = أُلغي (وُقِف)
  const A = gate({ updatedCount: 954, absentZeros: 600 });   // (أ) اليوم — يمرّ (updated≠0)
  const B = gate({ updatedCount: 0, absentZeros: 852 });     // (ب) حادثة 852 — يوقف
  const C = gate({ updatedCount: 0, absentZeros: 0 });       // (ج) 0/0 — يمرّ
  const few = gate({ updatedCount: 0, absentZeros: 5 });     // بضعة قرارات (<20) — يمرّ
  const edge = gate({ updatedCount: 0, absentZeros: 20 });   // الحدّ 20 — يوقف
  return { A, B, C, few, edge, calls, min: ABSENT_ZERO_MIN };
});
await b.close();
const fails = [];
if (res.A !== true) fails.push("(أ) اليوم (954/600) يجب أن يمرّ — يوجد تحديث حقيقيّ");
if (res.B !== false) fails.push("(ب) حادثة 852 (0/852) يجب أن يوقف");
if (res.C !== true) fails.push("(ج) 0/0 يجب أن يمرّ");
if (res.few !== true) fails.push("بضعة قرارات (0/5 < 20) يجب أن تمرّ — لا إنذار كاذب");
if (res.edge !== false) fails.push(`الحدّ (0/${res.min}) يجب أن يوقف`);
// الحوار يُستدعى فقط في حالات الإيقاف (ب ＋ الحدّ) = مرّتان، ويذكر السبب بالأرقام
if (res.calls.length !== 2) fails.push(`عدد الحوارات=${res.calls.length} (متوقّع 2: الإيقافان فقط)`);
for (const m of res.calls) {
  if (!/تم تحديثه 0/.test(m)) fails.push("الحوار يجب أن يذكر «تم تحديثه 0»");
  if (!/صنفاً غائباً/.test(m) || !/عمود/.test(m)) fails.push("الحوار يجب أن يشرح السبب (صنف غائب · فشل قراءة عمود)");
}
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-VALVE مسك إسقاط شرط updated==0: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إسقاط الشرط — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-VALVE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-VALVE: (أ) 954/600 يمرّ · (ب) 0/852 يوقف · (ج) 0/0 يمرّ · بضعة قرارات تمرّ · الحدّ ${res.min} يوقف · الحوار بالأرقام.`);
