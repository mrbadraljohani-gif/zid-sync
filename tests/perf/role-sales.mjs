// ============================================================================
// G-ROLE-SALES — عزل «شاشة عرض المبيعات» بالدور (طبقتان):
//   الواجهة (متصفّح): owner يرى الشاشة ويفتحها · admin الرابط مخفيّ و goPage('sales') محجوب ·
//     marketing يرى الشاشة فقط و goPage لأي صفحة أخرى يحوّله إليها · linkForbidden للجميع عدا owner.
//   دفعة ٣ (supabase_sales_admin_close.sql): sales_movements/sales_stock قراءة owner+marketing فقط (بلا admin) ·
//     sales_uploads تُبقي admin (الرفع) · INSERT owner+admin · العرض cost_price مُبقىً owner+marketing.
//   الواجهة: admin في صفحة المخزون يستعلم sales_uploads فقط — صفر استعلام sales_movements/sales_stock (حالة الرفع بلا بيانات مبيعات).
//   ⚠ حدّ مُعلَن: منع admin **فعلياً في القاعدة** (0 صفّ) يحتاج Supabase حيّاً — يُثبَّت بالاستعلام اليدويّ لا هنا.
// --broken: applyRoleUI يُظهر المبيعات لـadmin ⇒ يرسب.
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
  const A = 'if (pg === "sales") show = canSeeSales();';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد سطر رؤية رابط المبيعات"); process.exit(2); }
  html = html.replace(A, 'if (pg === "sales") show = true;');   // يُظهره للجميع (بمن فيهم admin)
}
const sql = readFileSync(join(root, "supabase_marketing_role.sql"), "utf8");
const closeSql = readFileSync(join(root, "supabase_sales_admin_close.sql"), "utf8");   // دفعة ٣: إغلاق admin
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  const linkShown = pg => { const a = document.querySelector('.side-link[data-page="' + pg + '"]'); return a ? getComputedStyle(a).display !== "none" : false; };
  const activePage = () => { const el = document.querySelector(".page.active"); return el ? el.id.replace("page-", "") : ""; };
  const probe = role => {
    myRole = role; applyRoleUI();
    const salesLink = linkShown("sales"), invLink = linkShown("inventory");
    goPage("sales"); const afterSales = activePage();
    goPage("inventory"); const afterInv = activePage();
    return { salesLink, invLink, afterSales, afterInv, linkForbidden: linkForbidden() };
  };
  const roles = { owner: probe("owner"), admin: probe("admin"), marketing: probe("marketing"), viewer: probe("viewer") };
  // دفعة ٣: admin في صفحة المخزون (fillUploadStatus) يستعلم sales_uploads فقط — 🚫 صفر استعلام sales_movements/sales_stock
  const q = { sales_movements: 0, sales_stock: 0, sales_uploads: 0 };
  myRole = "admin"; dbOnline = true; authSession = { user: { email: "a@x.sa" } }; invBranches = [];
  db.sales = { uploads: async () => { q.sales_uploads++; return []; }, movements: async () => { q.sales_movements++; return []; }, clearSuspect: async () => {} };
  sb = { from: (t) => { if (t === "sales_stock") q.sales_stock++; return { select: () => ({ range: async () => ({ data: [], error: null }) }) }; } };
  let filErr = null; try { await fillUploadStatus(); } catch (e) { filErr = String(e); }
  return { ...roles, adminQ: q, filErr };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const O = res.owner, A = res.admin, M = res.marketing, V = res.viewer;
// owner: يرى المبيعات ويفتحها ويتنقّل بحرّية
if (!(O.salesLink && O.afterSales === "sales" && O.afterInv === "inventory")) fails.push("owner: لا يرى/يفتح المبيعات أو لا يتنقّل بحرّية");
if (O.linkForbidden) fails.push("owner: linkForbidden=true (خطأ)");
// admin: الرابط مخفيّ · goPage('sales') محجوب (يبقى/يعود) لا يفتح المبيعات · بقيّة التنقّل يعمل
if (A.salesLink) fails.push("admin: رابط المبيعات ظاهر (يجب مخفيّاً)");
if (A.afterSales === "sales") fails.push("admin: goPage('sales') فتح المبيعات (يجب محجوباً)");
if (A.afterInv !== "inventory") fails.push("admin: لا يصل المخزون (كُسر سلوكه القائم)");
if (!A.linkForbidden) fails.push("admin: linkForbidden=false");
// marketing: يرى المبيعات فقط · أي صفحة أخرى تحوّله للمبيعات
if (!M.salesLink) fails.push("marketing: لا يرى شاشة المبيعات");
if (M.invLink) fails.push("marketing: يرى رابط المخزون (يجب مخفيّاً — المبيعات فقط)");
if (M.afterSales !== "sales") fails.push("marketing: لا يفتح المبيعات");
if (M.afterInv !== "sales") fails.push("marketing: goPage('inventory') لم يُحوّله للمبيعات");
if (!M.linkForbidden) fails.push("marketing: linkForbidden=false (تسرّب — نظير ثغرة linkForbidden)");
// viewer: كـadmin في حجب المبيعات
if (V.salesLink || V.afterSales === "sales") fails.push("viewer: يرى/يفتح المبيعات (يجب محجوباً)");
if (!V.linkForbidden) fails.push("viewer: linkForbidden=false");
// دفعة ٣: admin في صفحة المخزون يستعلم sales_uploads فقط — صفر استعلام sales_movements/sales_stock
if (res.filErr) fails.push("admin fillUploadStatus رمى: " + res.filErr);
if (res.adminQ.sales_movements !== 0) fails.push(`admin استعلم sales_movements ${res.adminQ.sales_movements} مرّة (يجب 0 — صفر صفّ مبيعات)`);
if (res.adminQ.sales_stock !== 0) fails.push(`admin استعلم sales_stock ${res.adminQ.sales_stock} مرّة (يجب 0)`);
if (res.adminQ.sales_uploads < 1) fails.push("admin لم يستعلم sales_uploads (حالة الرفع «آخر رفعة» مفقودة)");
// طبقة القاعدة (ساكن) — دفعة ٣ (supabase_sales_admin_close.sql): قراءة المبيعات owner+marketing فقط · uploads تُبقي admin
if (!/alter policy sales_movements_select_ro[\s\S]*?get_my_role\(\) in \('owner','marketing'\)/.test(closeSql)) fails.push("SQL٣: قراءة sales_movements ليست مقصورة owner+marketing (بلا admin)");
if (!/alter policy sales_uploads_select_ro[\s\S]*?get_my_role\(\) in \('owner','marketing','admin'\)/.test(closeSql)) fails.push("SQL٣: sales_uploads لم تُبقِ admin (الرفع يحتاجها)");
if (!/security_invoker = false/.test(closeSql) || !/where public.get_my_role\(\) in \('owner','marketing'\)/.test(closeSql)) fails.push("SQL٣: عرض sales_stock ليس owner+marketing (بلا admin)");
if (/where public.get_my_role\(\) in \('owner','marketing','admin'\)/.test(closeSql)) fails.push("SQL٣: بقي admin في شرط عرض sales_stock");
if (!/case when public.get_my_role\(\) in \('owner','marketing'\) then s.cost_price/.test(closeSql)) fails.push("SQL٣: العرض لا يُبقي عمود cost_price (create or replace سيفشل بحذف عمود)");
// الكتابة (INSERT owner+admin) والعزل restrictive يبقيان في marketing-role.sql
if (!/for insert to authenticated with check \(public.get_my_role\(\) in \(''owner'',''admin''\)\)/.test(sql)) fails.push("SQL: إدراج المبيعات ليس owner+admin");
if (!/as restrictive for select to authenticated using \(public.get_my_role\(\) is distinct from ''marketing''\)/.test(sql)) fails.push("SQL: لا سياسة restrictive تعزل marketing عن بقيّة الجداول");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-ROLE-SALES مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إظهار المبيعات لـadmin — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-ROLE-SALES:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-ROLE-SALES: owner كل شيء · admin بلا شاشة المبيعات (رابط مخفيّ ＋ goPage محجوب، وبقيّته سليمة) · marketing المبيعات فقط · viewer محجوب · SQL (owner+marketing قراءةً · owner+admin إدراجاً · restrictive · view مقيّد).");
