// ============================================================================
// حارس المسار الكامل للرفع (onMergeWh/onMergeBranch → bulkUpsert) — بالرؤوس الحقيقية لملفات المستخدم.
// الحادثة: عمود الكود اسمه «الباركورد» ⇒ لم يُعرَف كوداً ⇒ حارس الرفع رفض الملف ⇒ الأسعار لم تُخزَّن.
// حارس الوحدة (inv-cols) يفحص detectInvCols وحدها فيمرّ بالمصادفة؛ هذا يفحص **القيمة الواصلة** فعليّاً.
// يتحقّق: price_incl == 15 (لا «موجود») والكود يصلان bulkUpsert، للمستودع والفرع، بالرؤوس الحرفية ＋ العمود الخامس الفارغ.
// --broken: يعطّل قبول عمود الباركود كوداً ⇒ الملف يُرفَض ⇒ لا يصل bulkUpsert ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const FIX = "if (ci < 0 && bi >= 0) { ci = bi; bi = -1; }";
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد قبول الباركود-كوداً لتعطيله"); process.exit(2); }
  html = html.replace(FIX, "if (false) { ci = bi; bi = -1; }");   // أعِد العطل: «الباركورد» لا يُقبل كوداً
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  const runLive = async (handler, aoa, fileName) => {
    try { readWB = async () => ({ SheetNames: ["S"], Sheets: { S: {} } }); } catch (e) {}
    window.XLSX = { utils: { sheet_to_json: () => aoa, aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, read: () => ({}), write: () => new Uint8Array(0) };
    let captured = null;
    try { dbOnline = true; } catch (e) {}
    try { sb = { from: () => ({ select: () => ({}) }) }; } catch (e) {}
    db.activity = { insert: async () => {} };
    db.inventory = Object.assign({}, db.inventory, { getAll: async () => [], getAllCodes: async () => [], bulkUpsert: async (t, rows) => { captured = rows; }, removeCodes: async () => {}, setMeta: async () => {} });
    // فرع مختار ＋ سجلّ فروع (دفعة ١أ: onMergeBranch يتطلّب branchId من #brSelect)
    const BR = [{ id: "br1", name: "العزيزية", item_count: 0 }];
    try { invBranches = BR; } catch (e) {}
    db.branches = { getAll: async () => BR, setMeta: async () => {}, create: async () => {} };
    try { invMeta = { id: 1 }; } catch (e) {}
    try { mergeWh = null; mergeBranches = []; } catch (e) {}
    // دفعة ٢: onMergeBranch يقرأ branchId من بطاقة الفرع (data-branch) لا من قائمة — نحاكي closest
    const fakeCard = { dataset: { branch: "br1" }, querySelector: () => null, classList: { add() {}, remove() {} } };
    await handler({ files: [{ name: fileName }], value: "", closest: () => fakeCard });
    return captured;
  };
  // رؤوس المستخدم الحرفية (الكود = «الباركورد»)
  const whAoa = [["الباركورد", "اسم الصنف", "الكميه", "السعر"], [80151, "كرسى حديد", 9, 380]];
  const brAoa = [["الباركورد", "اسم المنتج", "الكمية", "السعر", null], [210016, "حزام حج ZM1B-2 - 16023", 6, 15, null]];
  const wh = await runLive(onMergeWh, whAoa, "المستودع.xlsx");
  const br = await runLive(onMergeBranch, brAoa, "العزيزية.xlsx");
  const pick = r => r ? { code: r[0].code, qty: r[0].qty, price_incl: r[0].price_incl } : null;
  return { wh: pick(wh), br: pick(br) };
});
await b.close();
const fails = [];
const chk = (o, label, code, price) => {
  if (!o) { fails.push(`${label}: الصفّ لم يصل bulkUpsert (الملف مرفوض — «الباركورد» لم يُعرَف كوداً)`); return; }
  if (String(o.code) !== String(code)) fails.push(`${label}: code=${o.code} ≠ ${code}`);
  if (o.price_incl !== price) fails.push(`${label}: price_incl=${o.price_incl} ≠ ${price} (القيمة لم تصل)`);
};
chk(res.wh, "المستودع", 80151, 380);
chk(res.br, "الفرع", 210016, 15);
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) الحارس مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد تعطيل قبول الباركود-كوداً — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ حارس المسار الكامل:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ المسار الكامل: الكود والسعر يصلان bulkUpsert بالرؤوس الحقيقية — المستودع(code=${res.wh.code}, price=${res.wh.price_incl}) · الفرع(code=${res.br.code}, price=${res.br.price_incl}).`);
