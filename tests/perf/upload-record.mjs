// ============================================================================
// G-UPLOAD-RECORD — سجلّ الرفعة واقعة لا تحليل ＋ تنبيهات ملخّص الرفع (القيمة، لا الشكل):
//   ① رفعة بلا حركات (ملف مطابق): recordUpload يكتب صفّ sales_uploads · recordMovements لا يكتب شيئاً.
//   ② موضع الاستدعاء يكتب الرأس **دائماً** (await recordUpload بلا شرط movs) ثم الحركات مشروطة.
//   ③ فشل إدراج sales_uploads ⇒ recordUpload يعيد false (🚫 لا throw ولا رسالة فشل عامّة) — والمُستدعي يفصل «البيانات محفوظة · تسجيل الرفعة فشل».
//   ④ بند ١: syncExtras يعرض تنبيه «ملف مطابق» باسم الموقع وعمره عند identical · لا تنبيه حين مختلف.
//   ⑤ بند ٢: syncExtras عند uploadOk=false يقول «حُفظت البيانات» ＋ «تعذّر تسجيل الرفعة» — 🚫 لا يوحي بفشل الحفظ.
// --broken: يُقيَّد await recordUpload بـmovs.length ⇒ الرفعة المطابقة لا تُسجَّل ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const CALL = "uploadOk = await recordUpload(uploadId, salesLoc, capNow, fileName, rows.length, anz.note, anz.suspect);";
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  if (!html.includes(CALL)) { console.error("✗ (--broken) لم أجد استدعاء recordUpload"); process.exit(2); }
  html = html.replace(CALL, "uploadOk = anz.movs.length ? await recordUpload(uploadId, salesLoc, capNow, fileName, rows.length, anz.note, anz.suspect) : true;");   // العطل القديم: الرأس مشروط بالحركات
}
const staticFails = [];
if (!BROKEN) {
  if (!html.includes(CALL)) staticFails.push("② استدعاء «await recordUpload» غير موجود بصيغته غير المشروطة");
  if (/anz\.movs\.length\s*\?\s*await recordUpload/.test(html)) staticFails.push("② recordUpload مقيّد بـmovs.length (يجب أن يُكتب الرأس دائماً)");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { if (/^https?:/.test(r.url())) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(async () => {
  dbOnline = true;
  const cap = { sales_uploads: 0, sales_movements: 0 }; let toastCount = 0, throwing = false;
  window.showToast = () => { toastCount++; };
  sb = { from: (t) => ({ insert: async (payload) => { if (throwing && t === "sales_uploads") return { error: { message: "boom" } }; if (t in cap) cap[t] += (Array.isArray(payload) ? payload.length : 1); return { error: null }; } }) };
  window.confirm = () => true;
  const existMap = new Map([["A", { qty: 5, name: "A", price_incl: 10, price_excl: 8 }], ["B", { qty: 3, name: "B", price_incl: 20, price_excl: 17 }]]);
  const rows = [{ code: "A", qty: 5, name: "A", price_incl: 10, price_excl: 8 }, { code: "B", qty: 3, name: "B", price_incl: 20, price_excl: 17 }];
  const capNow = new Date().toISOString();
  const anz = analyzeMovements(existMap, rows, "az", capNow, null);
  const movsEmpty = anz.movs.length === 0;
  // موضع الاستدعاء (منطق syncInventoryToDB): الرأس دائماً ثم الحركات مشروطة
  const uploadOk = await recordUpload("U1", "az", capNow, "f.xlsx", rows.length, anz.note, anz.suspect);
  if (uploadOk && !anz.skip) await recordMovements("U1", anz.movs);
  const afterIdentical = { ...cap };
  // ③ فشل الرأس ⇒ false بلا throw بلا توست عامّ
  throwing = true; let threw = false, okFail;
  try { okFail = await recordUpload("U2", "az", capNow, "f.xlsx", 2, null, false); } catch (e) { threw = true; }
  // ④/⑤ syncExtras: تنبيه ملف مطابق ＋ فصل «حُفظت/تعذّر التسجيل»
  const iso = new Date(Date.now() - 9 * 3600000).toISOString();
  const exIdentical = syncExtras({ identical: true, uploadOk: true, prevSyncedAt: iso }, "العزيزية");
  const exDiff = syncExtras({ identical: false, uploadOk: true }, "الخضرة");
  const exFail = syncExtras({ identical: false, uploadOk: false }, "المستودع");
  return { movsEmpty, afterIdentical, threw, okFail, toastCount, exIdentical, exDiff, exFail };
});
await b.close();

if (BROKEN) {
  if (!html.includes(CALL) || /anz\.movs\.length\s*\?\s*await recordUpload/.test(html)) { console.log("✅ (--broken) G-UPLOAD-RECORD مسك العطل: recordUpload صار مشروطاً بـmovs.length."); process.exit(0); }
  console.error("✗ (--broken) لم يُقيَّد الاستدعاء — لا أسنان."); process.exit(1);
}
const fails = [...staticFails];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!res.movsEmpty) fails.push("① الملف المطابق أنتج حركات (يجب صفر)");
if (res.afterIdentical.sales_uploads !== 1) fails.push(`① رفعة مطابقة لم تكتب sales_uploads (=${res.afterIdentical.sales_uploads})`);
if (res.afterIdentical.sales_movements !== 0) fails.push(`① رفعة مطابقة كتبت sales_movements (=${res.afterIdentical.sales_movements})`);
if (res.threw) fails.push("③ recordUpload رمى استثناءً (يجب أن يعيد false بلا throw)");
if (res.okFail !== false) fails.push(`③ recordUpload لم يُعِد false عند الفشل (=${res.okFail})`);
if (res.toastCount !== 0) fails.push("③ recordUpload أظهر توست فشل عامّاً (يجب أن يفصّل المُستدعي فقط)");
// ④ تنبيه الملف المطابق
if (!/العزيزية/.test(res.exIdentical) || !/مطابق تماماً/.test(res.exIdentical) || !/9/.test(res.exIdentical)) fails.push(`④ تنبيه «ملف مطابق» ناقص (اسم/نصّ/عمر): «${res.exIdentical}»`);
if (res.exDiff !== "") fails.push(`④ ظهر تنبيه لملف مختلف (يجب لا شيء): «${res.exDiff}»`);
// ⑤ فصل «البيانات محفوظة» عن «تسجيل الرفعة فشل» — 🚫 لا إيحاء بفشل الحفظ
if (!/حُفظت بيانات المستودع/.test(res.exFail) || !/تعذّر تسجيل الرفعة/.test(res.exFail)) fails.push(`⑤ رسالة فشل التسجيل لا تفصل الأمرين: «${res.exFail}»`);
if (/فشل الحفظ|تعذّر الحفظ|لم تُحفظ|ضاعت/.test(res.exFail)) fails.push(`⑤ الرسالة توحي بفشل حفظ البيانات: «${res.exFail}»`);
if (fails.length) { console.error("✗ G-UPLOAD-RECORD:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-UPLOAD-RECORD: مطابق ⇒ sales_uploads=1/sales_movements=0 · الرأس غير مشروط · فشل الرأس ⇒ false بلا throw/توست عامّ · تنبيه «ملف مطابق» باسم＋عمر · فشل التسجيل يفصل «حُفظت البيانات».");
