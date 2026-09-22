// ============================================================================
// G-ROLE-SALES — عزل «شاشة عرض المبيعات» بالدور (طبقتان):
//   الواجهة (متصفّح): owner يرى الشاشة ويفتحها · admin الرابط مخفيّ و goPage('sales') محجوب ·
//     marketing يرى الشاشة فقط و goPage لأي صفحة أخرى يحوّله إليها · linkForbidden للجميع عدا owner.
//   القاعدة (فحص ساكن على supabase_marketing_role.sql): SELECT للمبيعات owner+marketing (لا using(true)) ·
//     INSERT owner+admin · عزل marketing restrictive (is distinct from) · العرض security_invoker=false مقيّد بالدور.
//   ⚠ حدّ مُعلَن: منع admin **فعلياً في القاعدة** يحتاج Supabase حيّاً — يُثبَّت بالاستعلام اليدويّ لا هنا.
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
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  const linkShown = pg => { const a = document.querySelector('.side-link[data-page="' + pg + '"]'); return a ? getComputedStyle(a).display !== "none" : false; };
  const activePage = () => { const el = document.querySelector(".page.active"); return el ? el.id.replace("page-", "") : ""; };
  const probe = role => {
    myRole = role; applyRoleUI();
    const salesLink = linkShown("sales"), invLink = linkShown("inventory");
    goPage("sales"); const afterSales = activePage();
    goPage("inventory"); const afterInv = activePage();
    return { salesLink, invLink, afterSales, afterInv, linkForbidden: linkForbidden() };
  };
  return { owner: probe("owner"), admin: probe("admin"), marketing: probe("marketing"), viewer: probe("viewer") };
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
// طبقة القاعدة (ساكن)
if (!/get_my_role\(\) in \(''owner'',''marketing''\)/.test(sql)) fails.push("SQL: قراءة المبيعات ليست owner+marketing");
if (/select_ro on public.%I for select to authenticated using \(true\)/.test(sql)) fails.push("SQL: بقيت using(true) على المبيعات");
if (!/for insert to authenticated with check \(public.get_my_role\(\) in \(''owner'',''admin''\)\)/.test(sql)) fails.push("SQL: إدراج المبيعات ليس owner+admin");
if (!/as restrictive for select to authenticated using \(public.get_my_role\(\) is distinct from ''marketing''\)/.test(sql)) fails.push("SQL: لا سياسة restrictive تعزل marketing عن بقيّة الجداول");
if (!/security_invoker = false/.test(sql) || !/where public.get_my_role\(\) in \('owner','marketing'\)/.test(sql)) fails.push("SQL: عرض sales_stock ليس security_invoker=false مقيّداً بالدور");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-ROLE-SALES مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إظهار المبيعات لـadmin — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-ROLE-SALES:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-ROLE-SALES: owner كل شيء · admin بلا شاشة المبيعات (رابط مخفيّ ＋ goPage محجوب، وبقيّته سليمة) · marketing المبيعات فقط · viewer محجوب · SQL (owner+marketing قراءةً · owner+admin إدراجاً · restrictive · view مقيّد).");
