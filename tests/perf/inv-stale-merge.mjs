// ============================================================================
// G-STALE (سلامة المدخل) — «مطابقة طازجة على مدخل ناقص تنتج أرقاماً واثقة وخاطئة».
//   جزءان يحرسان الإصلاح والحماية معاً:
//   ① رفع المستودع (onMergeWh) في جلسة لم تُحمَّل فيها الفروع ⇒ يعيد التحميل من القاعدة
//      فيدخل الفرع الموحّد (كمية مشتركة مجموعة 6+4=10)، لا موحّد مبتور (6).
//   ② حارس بنيوي: إن كانت القاعدة تحوي مخزون فروع (branch_count>0) والموحّد بلا أي فرع
//      ⇒ run يتوقّف (بانر «الموحّد ناقص» ＋ تنزيل معطّل ＋ بلا ملفّات) — لا أرقام صامتة.
// --broken: يزيل إعادة التحميل في onMergeWh ＋ يُعطّل invMergeIncomplete ⇒
//   ① الفرع يسقط (X=6) و② المطابقة تمضي وتنتج ملفّات على موحّد مبتور ⇒ يرسب.
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
  const RELOAD = "await loadInventoryFromDB();   // ← أعِد بناء المستودع ＋ **كل الفروع** من القاعدة، فلا يبقى الموحّد مبتوراً بلا فروع في جلسة لم تُرفع فيها فروع (علّة سابقة لـ١أ)";
  const GUARD = "function invMergeIncomplete() {\n  return !!(mergeWh && invMeta && Number(invMeta.branch_count) > 0 && mergeBranches.length === 0);\n}";
  if (!html.includes(RELOAD) || !html.includes(GUARD)) { console.error("✗ (--broken) لم أجد الإصلاح/الحارس لتعطيلهما"); process.exit(2); }
  html = html.replace(RELOAD, "/* إعادة التحميل مُعطّلة (المعطوب) */")
             .replace(GUARD, "function invMergeIncomplete() {\n  return false;\n}");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

// إعداد قاعدة مشتركة: المستودع X=6 · الفرع B: X=4 (المجموع الصحيح 10)
const setupDb = async () => p.evaluate(() => {
  const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
  const WH = [{ code: "X", name: "صنف", qty: 6, price_incl: 100, price_excl: 90, barcode: "", row_order: 0 }];
  const BR = [{ code: "X", name: "صنف", qty: 4, price_incl: 100, price_excl: 90, barcode: "", row_order: 0, branch_id: "B" }];
  window.__cap = null;
  db.inventory = {
    getAll: async t => (t === "warehouse_items" ? WH : BR),
    getAllCodes: async () => [], bulkUpsert: async (t, rows) => { window.__cap = rows; }, removeCodes: async () => {},
    setMeta: async () => {}, getMeta: async () => ({ id: 1, branch_count: 1, wh_count: 1 }),
  };
  db.branches = { getAll: async () => [{ id: "B", name: "فرع", item_count: 1 }], setMeta: async () => {}, create: async () => {} };
  db.activity = { insert: async () => {} };
  try { dbOnline = true; sb = { from: () => ({ select: () => ({}) }) }; } catch (e) {}
});

// ---------- ① رفع المستودع يعيد تحميل الفروع (لا موحّد مبتور) ----------
const part1 = await (async () => {
  await setupDb();
  return p.evaluate(async () => {
    // جلسة طازجة: الفروع غير محمّلة بعد، لكن invMeta يعرف أنّ القاعدة فيها فرع
    mergeWh = null; mergeBranches = []; lastMerge = null; stData = null;
    invMeta = { id: 1, branch_count: 1, wh_count: 1 };
    // مولِّدات ملف المستودع الوهمي (كود X كمية 6) — رأس «قبل الضريبة» (سير العمل الجديد؛ لا يُطلق تحذير مضاعفة الضريبة)
    window.confirm = () => true;   // دفاعيّ: أيّ حوار (ضريبة/بوّابة) يُقبَل فلا يعلّق الاختبار
    window.XLSX = { utils: { sheet_to_json: () => [["رقم الصنف", "اسم الصنف", "الكمية", "قبل الضريبة"], ["X", "صنف", 6, 90]], aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, read: () => ({}), write: () => new Uint8Array(0) };
    try { readWB = async () => ({ SheetNames: ["S"], Sheets: { S: {} } }); } catch (e) {}
    await onMergeWh({ files: [{ name: "wh.xlsx" }], value: "" });
    const x = lastMerge ? [...lastMerge.unified, ...lastMerge.noPrice].find(r => r.code === "X") : null;
    return { branches: mergeBranches.length, xQty: x ? Number(x.qty) : null };
  });
})();

// ---------- ② حارس بنيوي: موحّد بلا فروع بينما القاعدة فيها فروع ⇒ توقّف ----------
const part2 = await p.evaluate(async () => {
  // حالة مبتورة صريحة: مستودع محمّل · لا فروع في الذاكرة · القاعدة تعرف بوجود فرع
  mergeWh = [{ code: "X", name: "صنف", qty: 6, incl: 100, excl: 90, bar: "" }];
  mergeBranches = []; invMeta = { id: 1, branch_count: 1, wh_count: 1 };
  stData = [["sku", "name_ar", "name_en", "quantity", "price", "barcode", "published", "has_variants"], ["X", "صنف", "", 10, 100, "", "No", "No"]];
  whRows = [{ "رقم الصنف": "X", "اسم الصنف": "صنف", "الكمية": 6, "سعر البيع شامل الضريبة": 100, "سعر البيع قبل الضريبة": 90, "باركود المستودع": "" }];
  lastRunSummary = null;
  const dq = document.getElementById("dlQty"); if (dq) { dq.href = "blob:x"; dq.classList.remove("disabled"); }   // فعّله عمداً لنرى إن عُطّل
  run();   // يجب أن يتوقّف قبل إنتاج أي ملف
  await new Promise(r => setTimeout(r, 50));
  const vm = document.getElementById("verifyMsg");
  const dq2 = document.getElementById("dlQty");
  return { incomplete: invMergeIncomplete(), banner: vm ? vm.textContent : "", dlDisabled: dq2 ? dq2.classList.contains("disabled") : null, summaryNull: lastRunSummary === null };
});
await b.close();

const fails = [];
// ① الفرع دخل الموحّد بكمية مجموعة
if (part1.branches < 1) fails.push(`① onMergeWh لم يُعِد تحميل الفروع (mergeBranches=${part1.branches}) — الموحّد مبتور`);
if (part1.xQty !== 10) fails.push(`① كمية X في الموحّد = ${part1.xQty} (متوقّع 10 = 6 مستودع + 4 فرع)`);
// ② الحارس البنيوي أوقف المطابقة
if (!part2.incomplete) fails.push("② invMergeIncomplete لم يكتشف الموحّد المبتور");
if (!/ناقص/.test(part2.banner)) fails.push(`② لا بانر «الموحّد ناقص» (نصّ: «${part2.banner.slice(0, 40)}»)`);
if (part2.dlDisabled !== true) fails.push("② زرّ تنزيل الكميات لم يُعطَّل عند الموحّد المبتور");
if (part2.summaryNull !== true) fails.push("② المطابقة أنتجت ملخّصاً (لم تتوقّف) على موحّد مبتور — أرقام صامتة");

if (BROKEN) {
  if (fails.length) { console.log(`✅ (--broken) G-STALE مسك العطل (${fails.length}): ${fails[0]}`); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إزالة الإصلاح والحارس — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-STALE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-STALE: ① رفع المستودع يحمّل الفروع (X=10 مجموعاً) · ② الموحّد المبتور يوقف المطابقة (بانر ＋ تنزيل معطّل ＋ بلا ملفّات).`);
