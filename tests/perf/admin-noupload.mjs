// ============================================================================
// G-ADMIN-NOUPLOAD — كتلة «بلا رفعة» لدور admin في صفحة المخزون (القيمة، لا الشكل):
//   ① تُعرض أسماء المواقع التي لم تُرفع اليوم (بتوقيت الرياض) — من sales_uploads وحده.
//   ② 🚫 صفر استعلام sales_movements/sales_stock (صفر صفّ مبيعات في استجابة admin).
//   ③ 🚫 لا كتلة «المفقود»/تحليل (salesBanner/salesDisBox مخفيّة).
//   ④ المواقع المرفوعة اليوم لا تظهر في «بلا رفعة».
// --broken: تُخفى كتلة «بلا رفعة» لـadmin (تُعاد إلى قائمة الإخفاء) ⇒ لا أسماء ⇒ يرسب.
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
  const A = '["salesBanner", "salesDisBox"].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = "none"; });';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد إخفاء كتل admin"); process.exit(2); }
  html = html.replace(A, '["salesMissBanner", "salesBanner", "salesDisBox"].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = "none"; });');   // يُخفي «بلا رفعة» أيضاً (العطل القديم)
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { if (/^https?:/.test(r.url())) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(async () => {
  const day = 86400000, iso = t => new Date(t).toISOString();
  myRole = "admin"; dbOnline = true; authSession = { user: { email: "a@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
  salesAllLocs = () => [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }, { id: "haraj_maf", name: "الحراج مفروشات" }, { id: "haraj_reh", name: "الحراج رحلات" }];
  const q = { sales_movements: 0, sales_stock: 0, sales_uploads: 0 };
  // آخر رفعة لكل موقع: المستودع/العزيزية/الحراج مفروشات اليوم · الخضرة قبل 3 أيام · الحراج رحلات لم تُرفع
  const ups = [
    { location: "wh", captured_at: iso(Date.now() - 2 * 3600000) },
    { location: "az", captured_at: iso(Date.now() - 3 * 3600000) },
    { location: "kh", captured_at: iso(Date.now() - 3 * day) },
    { location: "haraj_maf", captured_at: iso(Date.now() - 4 * 3600000) },
  ];
  db.sales = { uploads: async () => { q.sales_uploads++; return ups; }, movements: async () => { q.sales_movements++; return []; }, clearSuspect: async () => {} };
  sb = { from: (t) => { if (t === "sales_stock") q.sales_stock++; return { select: () => ({ range: async () => ({ data: [], error: null }) }) }; } };
  let err = null; try { await fillUploadStatus(); } catch (e) { err = String(e); }
  const mb = document.getElementById("salesMissBanner");
  const mbTxt = mb ? (mb.textContent || "") : "";
  const mbShown = mb ? getComputedStyle(mb).display !== "none" : false;
  const disShown = (id) => { const el = document.getElementById(id); return el ? getComputedStyle(el).display !== "none" : false; };
  return { q, err, mbTxt, mbShown, banner: disShown("salesBanner"), dis: disShown("salesDisBox") };
});
await b.close();

if (BROKEN) {
  if (!res.mbShown || !/الخضرة/.test(res.mbTxt)) { console.log("✅ (--broken) G-ADMIN-NOUPLOAD مسك العطل: كتلة «بلا رفعة» مخفيّة لـadmin (لا أسماء)."); process.exit(0); }
  console.error("✗ (--broken) بقيت الكتلة ظاهرة — لا أسنان."); process.exit(1);
}
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (res.err) fails.push("fillUploadStatus رمى: " + res.err);
if (res.q.sales_movements !== 0) fails.push(`② استعلم sales_movements ${res.q.sales_movements} (يجب 0)`);
if (res.q.sales_stock !== 0) fails.push(`② استعلم sales_stock ${res.q.sales_stock} (يجب 0)`);
if (res.q.sales_uploads < 1) fails.push("① لم يستعلم sales_uploads (مصدر «بلا رفعة»)");
if (!res.mbShown) fails.push("① كتلة «بلا رفعة» غير ظاهرة لـadmin");
if (!/الخضرة/.test(res.mbTxt)) fails.push(`① «الخضرة» (قبل 3 أيام) ليست في «بلا رفعة»: «${res.mbTxt}»`);
if (!/الحراج رحلات/.test(res.mbTxt)) fails.push(`① «الحراج رحلات» (لم تُرفع) ليست في «بلا رفعة»: «${res.mbTxt}»`);
if (/العزيزية|المستودع|الحراج مفروشات/.test(res.mbTxt)) fails.push(`④ موقع مرفوع اليوم ظهر في «بلا رفعة»: «${res.mbTxt}»`);
if (res.banner) fails.push("③ كتلة «المفقود» (salesBanner) ظاهرة لـadmin (يجب إخفاؤها)");
if (res.dis) fails.push("③ كتلة المختفي (salesDisBox) ظاهرة لـadmin");
if (fails.length) { console.error("✗ G-ADMIN-NOUPLOAD:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-ADMIN-NOUPLOAD: «بلا رفعة» تعرض المواقع غير المرفوعة اليوم (الخضرة/الحراج رحلات) من sales_uploads وحده · صفر استعلام مبيعات · المفقود مخفيّ.");
