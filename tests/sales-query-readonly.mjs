// ============================================================================
// G-SALES-QUERY-READONLY — قسم «استعلام عن منتج» عرضٌ فقط (القيمة، لا الشكل):
//   🚫 لا دالّة كتابة · 🚫 لا استعلام قاعدة مباشر (sb.from/sb.rpc/functions.invoke) · 🚫 لا مسار زد ·
//   ✅ يقرأ salesCtx.stock و salesCtx.movs فقط (محمّلان أصلاً من العرض sales_stock).
// --broken: يحقن sb.from("mappings").insert(...) في نطاق القسم ⇒ يرسب (كتابة/قاعدة/جدول زد).
// ============================================================================
import { readFileSync } from "node:fs";
import { stripComments } from "./lib/strip-comments.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
const BROKEN = process.argv.includes("--broken");

// نطاق القسم = دوالّه بأسمائها (sq* · salesQuery* · onSalesQuery)، لا مدى نصّي بين علامتين:
// المدى القديم (sqDebounce → renderSalesPage) انجرف حين أُضيفت fillUploadStatus بينهما — وهي تقرأ
// db.sales.uploads() قراءةً مشروعة خارج القسم — فرسب الحارس زوراً. الكود بلا تعليقات.
const code = stripComments(html.slice(html.lastIndexOf("\n<script>\n"), html.lastIndexOf("\n</script>")));
const QUERY_FN = /^(sq[A-Z]\w*|salesQuery\w*|onSalesQuery)$/;
function topFn(name) {   // جسم دالّة علويّة بمطابقة الأقواس (على كود بلا تعليقات)
  const m = new RegExp("\\n(?:async )?function " + name + "\\(").exec(code); if (!m) return "";
  let d = 0, started = false;
  for (let j = m.index; j < code.length; j++) { const c = code[j]; if (c === "{") { d++; started = true; } else if (c === "}") { d--; if (started && d === 0) return code.slice(m.index, j + 1); } }
  return code.slice(m.index);
}
const qNames = [...code.matchAll(/\n(?:async )?function (\w+)\(/g)].map(m => m[1]).filter(n => QUERY_FN.test(n));
let scope = qNames.map(topFn).join("\n");
const QUERY_EXPECT = ["onSalesQuery", "salesQueryRun", "salesQueryPick", "salesQueryDetail", "sqBadgeRow", "sqStockByLoc"];
const qMissing = QUERY_EXPECT.filter(n => !qNames.includes(n));
if (BROKEN) scope += '\n sb.from("mappings").insert({ x: 1 });\n';   // حقن كتابة/قاعدة/جدول زد

const fails = [];
if (!scope) fails.push("لم أجد نطاق قسم الاستعلام");
if (qMissing.length) fails.push("دوالّ القسم غير موجودة (تغيّرت الأسماء؟): " + qMissing.join(" · "));
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
