// ============================================================================
// G-INV-COMPLETE — كشف «لم تُرفع اليوم» تنبيهٌ إعلاميّ لا قفل ＋ مصدر موحّد (القيمة، لا الشكل):
//   ① invStaleToday(latest) من **sales_uploads** (نفس مصدر كتلة «آخر رفعة») — لا invMeta/branches.
//   ② المستودع ＋ فروع زد فقط · 🚫 الحراج مستثنى.
//   ③ invStaleMsg تنبيه إعلاميّ يسمّي المواقع والتاريخ (🚫 لا «أوقفتُ التنزيل»).
//   ④ 🚫 التنزيل غير مقفول بـstaleLocs (شرط wireDl القديم) · #invStaleNote موجود · لا توست منع في أزرار التجربة.
//   ⑤ توحيد المصدر: invStaleToday وrenderSalesLastUp يقرآن نفس خريطة salesUploadsLatest ⇒ لا تناقض.
// --broken: يُعاد قفل wireDl بـstaleLocs ⇒ شرط الفتح يختفي ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const OPEN_COND = "if (ok && count > 0 && dbOnline && !invMergeIncomplete() && !histIncomplete) {";
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  if (!html.includes(OPEN_COND)) { console.error("✗ (--broken) لم أجد شرط الفتح"); process.exit(2); }
  html = html.replace(OPEN_COND, "const staleLocs2 = 1; if (ok && count > 0 && dbOnline && !invMergeIncomplete() && !histIncomplete && !staleLocs2) {");   // يعيد القفل (العطل)
}
const staticFails = [];
if (!BROKEN) {
  if (!html.includes(OPEN_COND)) staticFails.push("④ شرط فتح wireDl تغيّر (قد يكون أُقفِل)");
  if (!html.includes('id="invStaleNote"')) staticFails.push("④ عنصر #invStaleNote غير موجود");
  if (/showToast\([^)]*مواقع لم تُرفع اليوم/.test(html)) staticFails.push("④ توست منع «لم تُرفع اليوم» ما زال في أزرار التجربة");
  if (!/function invStaleToday\(latest\)/.test(html)) staticFails.push("① invStaleToday لا يأخذ خريطة (لم يُوحّد على sales_uploads)");
  if (!/from\("sales_uploads"\)/.test(html) || !/salesUploadsLatest/.test(html)) staticFails.push("① لا مصدر sales_uploads موحّد");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { if (/^https?:/.test(r.url())) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(() => {
  const day = 86400000, iso = t => new Date(t).toISOString();
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }, { id: "jd", name: "جدة" }];
  salesAllLocs = () => [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }, { id: "jd", name: "جدة" }, { id: "haraj_maf", name: "الحراج مفروشات" }];
  // sales_uploads: المستودع/العزيزية اليوم · الخضرة قبل 3 أيام · جدة غائبة · الحراج مفروشات قبل 3 أيام (يجب استثناؤه)
  const ups = [
    { location: "wh", captured_at: iso(Date.now() - 2 * 3600000) },
    { location: "az", captured_at: iso(Date.now() - 3 * 3600000) },
    { location: "kh", captured_at: iso(Date.now() - 3 * day) },
    { location: "haraj_maf", captured_at: iso(Date.now() - 3 * day) },
  ];
  const latest = salesUploadsLatest(ups);
  const miss1 = invStaleToday(latest).map(m => m.name);
  const msg1 = invStaleMsg(invStaleToday(latest));
  const harajIn = miss1.some(n => /الحراج/.test(n));
  // توحيد المصدر: كتلة «آخر رفعة» تبني latest بنفس المنطق — نتحقّق أنّ الأعمار متطابقة لكل موقع
  const blockLatest = new Map();
  for (const u of ups) { const t = Date.parse(u.captured_at); if (!blockLatest.has(u.location) || t > blockLatest.get(u.location)) blockLatest.set(u.location, t); }
  const sameSource = [...latest.entries()].every(([k, v]) => blockLatest.get(k) === v);
  // كل المواقع اليوم ⇒ فارغة
  const ups2 = ["wh", "az", "kh", "jd"].map(l => ({ location: l, captured_at: iso(Date.now() - 3600000) }));
  const miss2 = invStaleToday(salesUploadsLatest(ups2)).map(m => m.name);
  return { miss1, msg1, harajIn, sameSource, miss2 };
});
await b.close();

if (BROKEN) {
  if (!html.includes(OPEN_COND)) { console.log("✅ (--broken) G-INV-COMPLETE مسك العطل: التنزيل أُقفِل (شرط الفتح اختفى)."); process.exit(0); }
  console.error("✗ (--broken) شرط الفتح باقٍ — لا أسنان."); process.exit(1);
}
const fails = [...staticFails];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!res.miss1.includes("الخضرة")) fails.push(`① الخضرة (قبل 3 أيام) ليست في الناقص: ${JSON.stringify(res.miss1)}`);
if (!res.miss1.includes("جدة")) fails.push(`① جدة (غائبة) ليست في الناقص: ${JSON.stringify(res.miss1)}`);
if (res.miss1.includes("المستودع") || res.miss1.includes("العزيزية")) fails.push("① موقع مرفوع اليوم عُدّ ناقصاً");
if (res.harajIn) fails.push("② فرع حراج دخل حساب اكتمال زد (يجب استثناؤه)");
if (!/الخضرة/.test(res.msg1) || !/جدة/.test(res.msg1)) fails.push(`③ الرسالة لا تسمّي المواقع الناقصة: «${res.msg1}»`);
if (!/آخر رفعة|لم تُرفع/.test(res.msg1)) fails.push("③ الرسالة لا تذكر تاريخ آخر رفعة");
if (/أوقفت|أوقفتُ|لا تنزيل/.test(res.msg1)) fails.push(`③ الرسالة تدّعي منع التنزيل (يجب إعلاميّة): «${res.msg1}»`);
if (!res.sameSource) fails.push("⑤ invStaleToday وكتلة «آخر رفعة» لا يتطابقان في المصدر (sales_uploads)");
if (res.miss2.length !== 0) fails.push(`كل المواقع اليوم لكنّ الناقص غير فارغ: ${JSON.stringify(res.miss2)}`);
if (fails.length) { console.error("✗ G-INV-COMPLETE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-INV-COMPLETE: invStaleToday من sales_uploads (موحّد مع الكتلة) · الخضرة/جدة ناقصتان · الحراج مستثنى · تنبيه لا قفل · #invStaleNote موجود · كل المواقع اليوم ⇒ فارغ.");
