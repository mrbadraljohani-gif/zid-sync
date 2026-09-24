// ============================================================================
// G-SALES-QUERY-READONLY — قسم «استعلام عن منتج» عرضٌ فقط (القيمة، لا الشكل):
//   🚫 لا دالّة كتابة · 🚫 لا استعلام قاعدة مباشر (sb.from/sb.rpc/functions.invoke) · 🚫 لا مسار زد ·
//   ✅ يقرأ salesCtx.stock و salesCtx.movs فقط (محمّلان أصلاً من العرض sales_stock).
// --broken: يحقن sb.from("mappings").insert(...) في نطاق القسم ⇒ يرسب (كتابة/قاعدة/جدول زد).
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
const BROKEN = process.argv.includes("--broken");

// نطاق القسم: من onSalesQuery حتى renderSalesPage
const start = html.indexOf("let sqDebounce");
const end = html.indexOf("async function renderSalesPage", start);
let scope = (start >= 0 && end > start) ? html.slice(start, end) : "";
if (BROKEN) scope += '\n sb.from("mappings").insert({ x: 1 });\n';   // حقن كتابة/قاعدة/جدول زد

const fails = [];
if (!scope) fails.push("لم أجد نطاق قسم الاستعلام");
// 🚫 لا استعلام قاعدة مباشر
for (const p of ["sb.from(", "sb.rpc(", ".functions.invoke", "db.inventory", "db.sales", "db.salesBranches"]) if (scope.includes(p)) fails.push(`استعلام قاعدة مباشر في القسم: ${p}`);
// 🚫 لا كتابة
for (const p of [".insert(", ".update(", ".delete(", ".upsert(", "dbSetMapping", "addMapping", "markWaiting", "run(true)", "saveMatchedHistory"]) if (scope.includes(p)) fails.push(`كتابة/تعديل في القسم: ${p}`);
// 🚫 لا مسار زد/مطابقة
for (const p of ["mappings", "branch_items", "warehouse_items", "sales_branch_items", "zid_products", "qtyRows", "priceRows", "resolveWhCode", "loadInventoryFromDB"]) if (scope.includes(p)) fails.push(`مسار زد/مطابقة في القسم: ${p}`);
// ✅ المصدر الصحيح
const usesStock = scope.includes("salesCtx.stock"), usesMovs = scope.includes("salesCtx.movs");

if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-SALES-QUERY-READONLY مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يُرصد الحقن — لا أسنان."); process.exit(1);
}
if (!usesStock) fails.push("لا يقرأ salesCtx.stock (المصدر الوحيد المسموح)");
if (!usesMovs) fails.push("لا يقرأ salesCtx.movs (المبيعات المقدّرة بلا استعلام إضافي)");
if (fails.length) { console.error("✗ G-SALES-QUERY-READONLY:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SALES-QUERY-READONLY: عرضٌ فقط — يقرأ salesCtx.stock/movs · لا كتابة · لا استعلام قاعدة مباشر · لا مسار زد.");
