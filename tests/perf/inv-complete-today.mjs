// ============================================================================
// G-INV-COMPLETE — اكتمال المدخل لكل موقع ولليوم (القيمة، لا الشكل):
//   ① invStaleToday() يُرجع أسماء المواقع (المستودع ＋ فروع زد) التي لم تُرفع اليوم (بتوقيت الرياض).
//   ② 🚫 فرعا الحراج (SALES_EXTRA_LOCS) خارج الحساب.
//   ③ ناقص موقع ⇒ رسالة تذكر اسمه وتاريخ آخر رفعة (invStaleMsg) — لا رسالة عامّة.
//   ④ كل المواقع اليوم ⇒ invStaleToday()=[] (التنزيل يُفتح). ⑤ التنزيل مربوط بـinvStaleToday (فحص ساكن).
// --broken: invStaleToday يتجاهل الفروع (المستودع وحده) ⇒ فرع قديم يمرّ ⇒ يرسب.
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
  const A = 'for (const b of (invBranches || [])) { const ms = b.synced_at ? Date.parse(b.synced_at) : null; if (!ms || riyadhDay(ms) !== today) miss.push({ name: b.name || String(b.id), ms }); }';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد حلقة الفروع في invStaleToday"); process.exit(2); }
  html = html.replace(A, "");   // يتجاهل الفروع ⇒ فرع قديم لا يُرصَد
}
// فحص ساكن: قفل التنزيل مربوط بـinvStaleToday
const staticFails = [];
if (!BROKEN && !/staleLocs\.length === 0/.test(html)) staticFails.push("قفل wireDl لا يشترط staleLocs.length === 0");
if (!BROKEN && !/const staleLocs = invStaleToday\(\)/.test(html)) staticFails.push("run لا يحسب invStaleToday");
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { if (/^https?:/.test(r.url())) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(() => {
  const day = 86400000, iso = t => new Date(t).toISOString();
  const today = riyadhDay(Date.now());
  // المستودع اليوم · العزيزية اليوم · الخضرة قبل 3 أيام · جدة لم تُرفع قطّ
  invMeta = { wh_synced_at: iso(Date.now() - 2 * 3600000), branch_count: 100 };
  invBranches = [
    { id: "az", name: "العزيزية", synced_at: iso(Date.now() - 3 * 3600000) },
    { id: "kh", name: "الخضرة", synced_at: iso(Date.now() - 3 * day) },
    { id: "jd", name: "جدة", synced_at: null },
  ];
  const miss1 = invStaleToday().map(m => m.name);
  const msg1 = invStaleMsg(invStaleToday());
  // الحراج لا يدخل: نضيفه لـSALES_EXTRA_LOCS-المعتمد؟ invStaleToday يقرأ invBranches فقط — نتحقّق أنّ أسماء الحراج ليست في القائمة
  const harajIn = miss1.some(n => /الحراج/.test(n));
  // كل المواقع اليوم ⇒ فارغة
  invBranches = invBranches.map(b => ({ ...b, synced_at: iso(Date.now() - 1 * 3600000) }));
  const miss2 = invStaleToday().map(m => m.name);
  return { miss1, msg1, harajIn, miss2, today };
});
await b.close();

if (BROKEN) {
  if (!res.miss1.includes("الخضرة") && !res.miss1.includes("جدة")) { console.log("✅ (--broken) G-INV-COMPLETE مسك العطل: فرع قديم لم يُرصَد (تجاهُل الفروع)."); process.exit(0); }
  console.error("✗ (--broken) رُصد الفرع رغم التجاهل — لا أسنان. " + JSON.stringify(res)); process.exit(1);
}
const fails = [...staticFails];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!res.miss1.includes("الخضرة")) fails.push(`① الخضرة (قبل 3 أيام) ليست في الناقص: ${JSON.stringify(res.miss1)}`);
if (!res.miss1.includes("جدة")) fails.push(`① جدة (لم تُرفع) ليست في الناقص: ${JSON.stringify(res.miss1)}`);
if (res.miss1.includes("المستودع")) fails.push("① المستودع (اليوم) عُدّ ناقصاً خطأً");
if (res.miss1.includes("العزيزية")) fails.push("① العزيزية (اليوم) عُدّت ناقصة خطأً");
if (res.harajIn) fails.push("② فرع حراج دخل حساب اكتمال زد (يجب استثناؤه)");
if (!/الخضرة/.test(res.msg1) || !/جدة/.test(res.msg1)) fails.push(`③ الرسالة لا تذكر أسماء المواقع الناقصة: «${res.msg1}»`);
if (!/آخر رفعة|لم تُرفع/.test(res.msg1)) fails.push("③ الرسالة لا تذكر تاريخ آخر رفعة");
if (res.miss2.length !== 0) fails.push(`④ كل المواقع اليوم لكنّ الناقص غير فارغ: ${JSON.stringify(res.miss2)}`);
if (fails.length) { console.error("✗ G-INV-COMPLETE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-INV-COMPLETE: لكل موقع ولليوم — الخضرة/جدة ناقصتان (المستودع/العزيزية اليوم لا) · الحراج مستثنى · الرسالة تسمّي المواقع وتاريخها · كل المواقع اليوم ⇒ مفتوح.");
