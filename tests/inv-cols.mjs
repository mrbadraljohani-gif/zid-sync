// ============================================================================
// G1 — كشف أعمدة المخزن المتسامح (detectInvCols): يجب أن يكتشف السعر بمرادفاته.
// الحادثة: رأس «السعر» المجرّد لم يُطابَق (كان يشترط سامل+ضريب) ⇒ noPrice ⇒ انهيار.
// يتحقّق: «السعر» المجرّد ⇒ incl · «...شامل الضريبة» ⇒ incl · «...قبل الضريبة» ⇒ excl ·
//   «الكميه» (هاء) ⇒ qty · «الباركورد» (خطأ) ⇒ barcode · وأعلام found للجوهريّات.
// HTML_PATH=<git show HEAD:index.html> يُثبت الرسوب على النسخة قبل الإصلاح.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BROKEN = process.argv.includes("--broken");
const INCL_FIX = '|| (x.includes("سعر") && !x.includes("قبل"))';   // قاعدة «سعر مجرّد ⇒ شامل»
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  if (!html.includes(INCL_FIX)) { console.error("✗ (--broken) لم أجد قاعدة السعر المجرّد لتعطيلها"); process.exit(2); }
  html = html.replace(INCL_FIX, "");   // أعِد عطل الحادثة: «السعر» المجرّد لا يُكتشَف
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  const d = h => detectInvCols(h);
  const plain = d(["رقم الصنف", "اسم الصنف", "الكمية", "السعر"]);
  const incl  = d(["رقم الصنف", "اسم الصنف", "الكميه", "السعر شامل الضريبة"]);
  const excl  = d(["كود", "الاسم", "الكمية", "سعر البيع قبل الضريبة"]);
  const bar   = d(["رقم الصنف", "اسم الصنف", "الكميه", "السعر", "الباركورد"]);
  return {
    plain_incl: plain.ii, plain_found: plain.found ? plain.found.incl : null, plain_code: plain.found ? plain.found.code : null, plain_qty: plain.found ? plain.found.qty : null,
    incl_ii: incl.ii, excl_ei: excl.ei, excl_incl: excl.ii,
    bar_bi: bar.bi, bar_found: bar.found ? bar.found.barcode : null,
    hasFound: !!plain.found,
  };
});
await b.close();
const fails = [];
if (!(res.hasFound)) fails.push("detectInvCols لا يُرجع أعلام found (النسخة قبل الإصلاح)");
// (نُجمّع الأخطاء ثم نقرّر — في --broken نتوقّع رسوباً)
if (!(res.plain_incl >= 0 && res.plain_found === true)) fails.push(`«السعر» المجرّد لم يُكتشَف incl (ii=${res.plain_incl}, found=${res.plain_found})`);
if (!(res.plain_code === true && res.plain_qty === true)) fails.push("الكود/الكمية لم يُكتشفا بالنمط");
if (!(res.incl_ii >= 0)) fails.push("«السعر شامل الضريبة» لم يُكتشَف incl");
if (!(res.excl_ei >= 0)) fails.push("«سعر البيع قبل الضريبة» لم يُكتشَف excl");
if (res.excl_incl >= 0) fails.push("«...قبل الضريبة» صُنّف incl خطأً (يجب excl فقط)");
if (!(res.bar_bi >= 0 && res.bar_found === true)) fails.push("«الباركورد» (خطأ إملائي) لم يُكتشَف barcode");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G1 مسك عطل كشف السعر: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد تعطيل قاعدة السعر المجرّد — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G1 كشف الأعمدة:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G1: كشف السعر (السعر/شامل/قبل) ＋ الكميه(هاء) ＋ الباركورد(خطأ) ＋ أعلام found — سليم.");
