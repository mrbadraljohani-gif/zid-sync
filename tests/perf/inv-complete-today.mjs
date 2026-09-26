// ============================================================================
// G-INV-COMPLETE — كشف اكتمال المدخل لكل موقع/يوم = **تنبيه إعلاميّ لا قفل** (تراجع مقصود بأمر بدر):
//   ① invStaleToday() يُرجع أسماء المواقع (المستودع ＋ فروع زد) التي لم تُرفع اليوم (بتوقيت الرياض).
//   ② 🚫 فرعا الحراج (SALES_EXTRA_LOCS) خارج الحساب.
//   ③ invStaleMsg تنبيه إعلاميّ يذكر الأسماء والتاريخ (🚫 لا «أوقفتُ التنزيل»).
//   ④ 🚫 التنزيل **غير مقفول** بـstaleLocs: شرط wireDl لا يشترطها · عنصر #invStaleNote موجود.
//   ⑤ كل المواقع اليوم ⇒ invStaleToday()=[].
// --broken: يُعاد قفل wireDl بـstaleLocs ⇒ شرط الفتح القديم يختفي ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const OPEN_COND = "if (ok && count > 0 && dbOnline && !invMergeIncomplete() && !histIncomplete) {";   // شرط الفتح (بلا قفل staleLocs)
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  if (!html.includes(OPEN_COND)) { console.error("✗ (--broken) لم أجد شرط الفتح"); process.exit(2); }
  html = html.replace(OPEN_COND, "const staleLocs2 = invStaleToday(); if (ok && count > 0 && dbOnline && !invMergeIncomplete() && !histIncomplete && staleLocs2.length === 0) {");   // يعيد القفل (العطل)
}
// ④ فحص ساكن: التنزيل غير مقفول بـstaleLocs · عنصر التنبيه موجود · لا توست منع في أزرار التجربة
const staticFails = [];
if (!BROKEN) {
  if (!html.includes(OPEN_COND)) staticFails.push("④ شرط فتح wireDl تغيّر (قد يكون أُقفِل بـstaleLocs)");
  if (/!histIncomplete && staleLocs\S* *\.length === 0\) \{/.test(html)) staticFails.push("④ التنزيل مقفول بـstaleLocs (يجب فتحه دائماً)");
  if (!html.includes('id="invStaleNote"')) staticFails.push("④ عنصر #invStaleNote (التنبيه الإعلاميّ) غير موجود");
  if (/showToast\([^)]*مواقع لم تُرفع اليوم/.test(html)) staticFails.push("④ توست منع «لم تُرفع اليوم» ما زال في أزرار التجربة");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { if (/^https?:/.test(r.url())) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(() => {
  const day = 86400000, iso = t => new Date(t).toISOString();
  invMeta = { wh_synced_at: iso(Date.now() - 2 * 3600000), branch_count: 100 };   // المستودع اليوم
  invBranches = [
    { id: "az", name: "العزيزية", synced_at: iso(Date.now() - 3 * 3600000) },   // اليوم
    { id: "kh", name: "الخضرة", synced_at: iso(Date.now() - 3 * day) },          // قبل 3 أيام
    { id: "jd", name: "جدة", synced_at: null },                                  // لم تُرفع
  ];
  const miss1 = invStaleToday().map(m => m.name);
  const msg1 = invStaleMsg(invStaleToday());
  const harajIn = miss1.some(n => /الحراج/.test(n));
  invBranches = invBranches.map(b => ({ ...b, synced_at: iso(Date.now() - 3600000) }));
  const miss2 = invStaleToday().map(m => m.name);
  return { miss1, msg1, harajIn, miss2 };
});
await b.close();

if (BROKEN) {
  if (!html.includes(OPEN_COND)) { console.log("✅ (--broken) G-INV-COMPLETE مسك العطل: التنزيل أُقفِل بـstaleLocs (شرط الفتح اختفى)."); process.exit(0); }
  console.error("✗ (--broken) شرط الفتح باقٍ — لا أسنان."); process.exit(1);
}
const fails = [...staticFails];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!res.miss1.includes("الخضرة")) fails.push(`① الخضرة (قبل 3 أيام) ليست في الناقص: ${JSON.stringify(res.miss1)}`);
if (!res.miss1.includes("جدة")) fails.push(`① جدة (لم تُرفع) ليست في الناقص: ${JSON.stringify(res.miss1)}`);
if (res.miss1.includes("المستودع") || res.miss1.includes("العزيزية")) fails.push("① موقع مرفوع اليوم عُدّ ناقصاً");
if (res.harajIn) fails.push("② فرع حراج دخل حساب اكتمال زد (يجب استثناؤه)");
if (!/الخضرة/.test(res.msg1) || !/جدة/.test(res.msg1)) fails.push(`③ الرسالة لا تسمّي المواقع الناقصة: «${res.msg1}»`);
if (!/آخر رفعة|لم تُرفع/.test(res.msg1)) fails.push("③ الرسالة لا تذكر تاريخ آخر رفعة");
if (/أوقفت|أوقفتُ|لا تنزيل|ثم «طابق/.test(res.msg1)) fails.push(`③ الرسالة تدّعي منع التنزيل (يجب إعلاميّة فقط): «${res.msg1}»`);
if (res.miss2.length !== 0) fails.push(`⑤ كل المواقع اليوم لكنّ الناقص غير فارغ: ${JSON.stringify(res.miss2)}`);
if (fails.length) { console.error("✗ G-INV-COMPLETE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-INV-COMPLETE: الكشف يبقى (الخضرة/جدة · الحراج مستثنى · الرسالة تسمّي وتاريخ) · تنبيه إعلاميّ لا قفل (wireDl مفتوح · #invStaleNote موجود · لا توست منع) · كل المواقع اليوم ⇒ فارغ.");
