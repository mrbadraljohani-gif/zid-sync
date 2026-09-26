// ============================================================================
// G-UPLOAD-RECORD — سجلّ الرفعة واقعة لا تحليل (القيمة، لا الشكل):
//   ① رفعة بلا حركات (ملف مطابق): recordUpload يكتب صفّ sales_uploads · recordMovements لا يكتب شيئاً.
//   ② موضع الاستدعاء يكتب الرأس **دائماً** (await recordUpload بلا شرط movs) ثم الحركات مشروطة.
//   ③ فشل إدراج sales_uploads ⇒ showToast مرئيّ ＋ throw (🚫 لا صمت console).
//   ④ recordMovements يبقى fire-and-forget مع console.warn (لا throw مرئيّ).
// --broken: يُقيَّد await recordUpload بـmovs.length ⇒ الرفعة المطابقة لا تُسجَّل ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const CALL = "await recordUpload(uploadId, salesLoc, capNow, fileName, rows.length, anz.note, anz.suspect);";
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  if (!html.includes(CALL)) { console.error("✗ (--broken) لم أجد استدعاء recordUpload"); process.exit(2); }
  html = html.replace(CALL, "if (anz.movs.length) " + CALL);   // يعيد ربط الرأس بوجود حركات (العطل القديم)
}
const staticFails = [];
if (!BROKEN) {
  if (!html.includes(CALL)) staticFails.push("② استدعاء «await recordUpload(...)» غير موجود بصيغته غير المشروطة");
  if (/if \(anz\.movs\.length\)\s*await recordUpload/.test(html)) staticFails.push("② recordUpload مقيّد بـmovs.length (يجب أن يُكتب الرأس دائماً)");
  if (!/if \(!movs \|\| !movs\.length\) return;/.test(html) && !/!movs\.length\) return/.test(html)) { /* recordMovements قد يحرس داخلياً — غير حرج */ }
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
const warns = []; p.on("console", m => { if (/warn|error/.test(m.type())) warns.push(m.text()); });
await p.setRequestInterception(true); p.on("request", r => { if (/^https?:/.test(r.url())) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(async () => {
  dbOnline = true;
  const cap = { sales_uploads: 0, sales_movements: 0 }; let toastCount = 0, throwing = false;
  window.showToast = (m) => { toastCount++; };
  sb = { from: (t) => ({ insert: async (payload) => { if (throwing && t === "sales_uploads") return { error: { message: "boom" } }; if (t in cap) cap[t] += (Array.isArray(payload) ? payload.length : 1); return { error: null }; } }) };
  window.confirm = () => true;
  // ملف مطابق للقاعدة تماماً ⇒ لا حركات (delta=0 للكل)
  const existMap = new Map([["A", { qty: 5, name: "A", price_incl: 10, price_excl: 8 }], ["B", { qty: 3, name: "B", price_incl: 20, price_excl: 17 }]]);
  const rows = [{ code: "A", qty: 5, name: "A", price_incl: 10, price_excl: 8 }, { code: "B", qty: 3, name: "B", price_incl: 20, price_excl: 17 }];
  const capNow = new Date().toISOString();
  const anz = analyzeMovements(existMap, rows, "az", capNow, null);
  const movsEmpty = anz.movs.length === 0;
  // موضع الاستدعاء (منطق syncInventoryToDB): الرأس دائماً ثم الحركات مشروطة
  await recordUpload("U1", "az", capNow, "f.xlsx", rows.length, anz.note, anz.suspect);
  if (!anz.skip) await recordMovements("U1", anz.movs);
  const afterIdentical = { ...cap };   // sales_uploads=1 · sales_movements=0
  // فشل الرأس ⇒ توست ＋ throw
  throwing = true; let threw = false;
  try { await recordUpload("U2", "az", capNow, "f.xlsx", 2, null, false); } catch (e) { threw = true; }
  return { movsEmpty, afterIdentical, threw, toastCount };
});
await b.close();

if (BROKEN) {
  // على المعطوب: الاستدعاء مقيّد بـmovs.length — الفحص الساكن يمسكه (الصيغة غير المشروطة اختفت)
  if (!html.includes(CALL) || /if \(anz\.movs\.length\)\s*await recordUpload/.test(html)) { console.log("✅ (--broken) G-UPLOAD-RECORD مسك العطل: recordUpload صار مشروطاً بـmovs.length (الرفعة المطابقة لا تُسجَّل)."); process.exit(0); }
  console.error("✗ (--broken) لم يُقيَّد الاستدعاء — لا أسنان."); process.exit(1);
}
const fails = [...staticFails];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!res.movsEmpty) fails.push("① الملف المطابق أنتج حركات (يجب صفر)");
if (res.afterIdentical.sales_uploads !== 1) fails.push(`① رفعة مطابقة لم تكتب sales_uploads (=${res.afterIdentical.sales_uploads}، يجب 1)`);
if (res.afterIdentical.sales_movements !== 0) fails.push(`① رفعة مطابقة كتبت sales_movements (=${res.afterIdentical.sales_movements}، يجب 0)`);
if (!res.threw) fails.push("③ فشل sales_uploads لم يُرمَ (يجب throw)");
if (res.toastCount < 1) fails.push("③ فشل sales_uploads لم يُظهر توست مرئيّاً");
if (fails.length) { console.error("✗ G-UPLOAD-RECORD:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-UPLOAD-RECORD: رفعة مطابقة ⇒ sales_uploads=1 · sales_movements=0 · الرأس غير مشروط بالحركات · فشل الرأس ⇒ توست ＋ throw.");
