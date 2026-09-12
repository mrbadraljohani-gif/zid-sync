// ============================================================================
// G2 — حماية الرفع: رأس موجود وعمود جوهري مفقود ⇒ رفض غنيّ في البطاقة، بلا اعتماد.
// الحادثة: عمود السعر غير مكتشَف ⇒ قُبل الملف صامتاً وأفسد ما بعده. الآن يُرفض صراحةً.
// يتحقّق: invColError(بلا سعر) ⇒ رسالة تذكر «السعر» والأعمدة و«لم يُحفظ» · (كامل) ⇒ null ·
//   showUploadReject يضع حالة «مرفوض» على البطاقة.
// HTML_PATH=<git show HEAD> يُثبت الرسوب (invColError غير موجودة قبل الإصلاح).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const PRICE_CHECK = 'if (!f.incl && !f.excl) missing.push("السعر");';
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  if (!html.includes(PRICE_CHECK)) { console.error("✗ (--broken) لم أجد فحص السعر في invColError لتعطيله"); process.exit(2); }
  html = html.replace(PRICE_CHECK, "");   // أعِد العطل: ملف بلا سعر لا يُرفَض
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  if (typeof invColError !== "function") return { noFn: true };
  const noPrice = ["رقم الصنف", "اسم الصنف", "الكميه"];   // بلا سعر
  const full = ["رقم الصنف", "اسم الصنف", "الكمية", "السعر"];
  const errMsg = invColError(detectInvCols(noPrice), noPrice, "العزيزية.xlsx", "المستودع");
  const okMsg = invColError(detectInvCols(full), full, "جيد.xlsx", "المستودع");
  // تحقّق حالة البطاقة
  let cardRejected = null, statusRejected = null;
  try { showUploadReject("whStatus", "whCard", errMsg || "x");
    statusRejected = document.getElementById("whStatus").className.includes("rejected");
    cardRejected = document.getElementById("whCard").classList.contains("rejected"); } catch (e) {}
  return { errMsg, okMsg, cardRejected, statusRejected };
});
await b.close();
const fails = [];
if (res.noFn) fails.push("invColError غير موجودة (النسخة قبل الإصلاح)");
else {
  if (res.okMsg !== null) fails.push("ملف كامل الأعمدة لم يُقبَل (invColError ليست null)");
  const m = res.errMsg || "";
  if (!m) fails.push("ملف بلا سعر لم يُرفَض (invColError null)");
  else {
    if (!m.includes("السعر")) fails.push("الرسالة لا تذكر العمود المفقود (السعر)");
    if (!m.includes("العزيزية.xlsx")) fails.push("الرسالة لا تذكر اسم الملف");
    if (!m.includes("الكميه")) fails.push("الرسالة لا تعرض الأعمدة المقروءة");
    if (!m.includes("لم يُحفظ")) fails.push("الرسالة لا تؤكّد أن الملف لم يُحفظ");
    if (!m.includes("المقبولة")) fails.push("الرسالة لا تذكر الأسماء المقبولة");
  }
  if (res.statusRejected !== true || res.cardRejected !== true) fails.push("showUploadReject لم يضع حالة «مرفوض» على البطاقة");
}
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G2 مسك سقوط الحماية: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد تعطيل فحص السعر — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G2 حماية الرفع:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G2: عمود جوهري مفقود ⇒ رفض غنيّ (يذكر العمود·الملف·الأعمدة·لم يُحفظ·المقبولة) ＋ حالة البطاقة «مرفوض».");
