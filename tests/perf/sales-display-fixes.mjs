// ============================================================================
// G-SALES-DISPLAY (ج-١ ＋ ج-٣) — إصلاحا عرض (القيمة، لا الشكل):
//   ج-١ لافتة الموقع الغائب لا تتناقض: موقع رفعته **تأسيسية فقط** ⇒ «رفعة تأسيس فقط — لا مقارنة بعد»
//       (لا «بلا رفعة» مع «آخر رفعة منذ X» في سطر واحد). وموقع لم يُرفع إطلاقاً ⇒ «لم يُرفع بعد».
//   ج-٣ جدول «أصناف اختفت» فيه عمود «اسم الصنف» بعد SKU؛ الاسم من الحركة (m.sku_name) بلا استعلام،
//       وتعذّره ⇒ «—» صراحةً (لا فراغ). يُختبَر صنفان: باسم · وبلا اسم.
// --broken       (ج-١): يعيد الصياغة القديمة «(آخر رفعة X)» للتأسيس ⇒ تناقض ⇒ يرسب.
// --broken-name  (ج-٣): يحذف خليّة الاسم ⇒ لا عمود اسم ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const BROKEN_NAME = process.argv.includes("--broken-name");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  // ذيل خاطئ لمجموعة التأسيس: «حتى تُرفع ملفاتها» بدل «رفعة ثانية تُقارن بها» (الملف مرفوع أصلاً)
  const A = 'if (base.length) segs.push(`${gN(base.length)} ${baseDesc(base.length)}: ${names(base)} — ${gArq(base.length)} تظهر حين تأتي رفعة ثانية تُقارن بها`);';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد مقطع التأسيس"); process.exit(2); }
  html = html.replace(A, 'if (base.length) segs.push(`${gN(base.length)} ${baseDesc(base.length)}: ${names(base)} — ${gArq(base.length)} تظهر حين ${raiseFiles(base.length)}`);');   // ذيل «تُرفع ملفاتها» الخاطئ للتأسيس
}
if (BROKEN_NAME) {
  const A = '<td>${m.sku_name ? esc(m.sku_name) : \'<span class="q-na">—</span>\'}</td>';
  if (!html.includes(A)) { console.error("✗ (--broken-name) لم أجد خليّة الاسم"); process.exit(2); }
  html = html.replace(A, '');   // حذف عمود الاسم
  html = html.replace('<th>SKU</th><th>اسم الصنف</th>', '<th>SKU</th>');
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setViewport({ width: 1200, height: 900 });
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
  salesPeriod = "all"; salesLoc = "all"; salesTab = "all";
  const now = new Date().toISOString();
  // kh: رفعة عاديّة (بيع). az: رفعة تأسيس فقط (كل حركاتها new) ⇒ missingLocs + baseline.
  const stock = [
    { location: "kh", sku: "K", name: "صنف خضرة", qty: 20, price_incl: 100, price_excl: 87, barcode: "1" },
    { location: "az", sku: "A", name: "صنف عزيزية", qty: 30, price_incl: 100, price_excl: 87, barcode: "2" },
  ];
  const movs = [
    { kind: "estimated_sale", delta: -5, value_est: 500, unit_price_incl: 100, unit_price_excl: 87, location: "kh", sku: "K", sku_name: "صنف خضرة", upload_id: "U_kh", captured_at: now, period_days: 5 },
    { kind: "new", delta: 30, location: "az", sku: "A", sku_name: "صنف عزيزية", upload_id: "U_az", captured_at: now, period_days: 5 },   // تأسيس az
    // مختفيان: أحدهما باسم والآخر بلا اسم
    { kind: "disappeared", delta: -7, value_est: 700, location: "kh", sku: "GONE1", sku_name: "مقلاة مفقودة", upload_id: "U_kh", captured_at: now, period_days: 5 },
    { kind: "disappeared", delta: -3, value_est: 300, location: "kh", sku: "GONE2", sku_name: null, upload_id: "U_kh", captured_at: now, period_days: 5 },
  ];
  const ups = [{ id: "U_kh", location: "kh", captured_at: now, suspect: false }, { id: "U_az", location: "az", captured_at: now, suspect: false }];
  db.sales = { uploads: async () => ups, movements: async () => movs, clearSuspect: async () => {} };
  sb = { rpc: async () => ({ data: [{ used: 0, cap: 500 }], error: null }), from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const banner = (document.getElementById("salesMissBanner").textContent || "").replace(/\s+/g, " ");
  // ج-٣: افتح جدول المختفي
  const box = document.getElementById("salesDisBox");
  await salesShowDisappeared();
  const heads = [...box.querySelectorAll("thead th")].map(t => (t.textContent || "").trim());
  const rows = [...box.querySelectorAll("tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => (td.textContent || "").trim()));
  return { banner, heads, rows };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));

// ج-١: المقطع التأسيسيّ (يحوي «تأسيسية») يحمل ذيل «رفعة ثانية تُقارن بها» — 🚫 لا «تُرفع ملفاتها» (الملف مرفوع أصلاً)
const segOf = re => res.banner.split("؛").find(s => re.test(s)) || "";
const baseSeg = segOf(/تأسيسية/);
if (BROKEN) {
  // مقطع التأسيس الصحيح لا يذكر «ملف» إطلاقاً (ذيله «رفعة ثانية تُقارن بها»)؛ العطل يُدخل ذيل رفع الملفات
  if (/ملف/.test(baseSeg) || !/رفعة ثانية تُقارن بها/.test(baseSeg)) { console.log(`✅ (--broken) G-SALES-DISPLAY مسك الذيل الخاطئ: مقطع التأسيس حمل ذيل رفع الملفات («${baseSeg.trim().slice(0,90)}»).`); process.exit(0); }
  console.error(`✗ (--broken) مقطع التأسيس لم يحمل الذيل الخاطئ — لا أسنان («${baseSeg.trim().slice(0,90)}»).`); process.exit(1);
}
if (BROKEN_NAME) {
  if (!res.heads.includes("اسم الصنف")) { console.log("✅ (--broken-name) G-SALES-DISPLAY مسك حذف عمود الاسم."); process.exit(0); }
  console.error("✗ (--broken-name) عمود الاسم بقي — لا أسنان."); process.exit(1);
}
// ج-١ الوضع السليم: مقطع تأسيسيّ موجود بالذيل الصحيح، بلا ذيل «تُرفع ملفاتها»، وبلا تكرار السبب بعد كل فرع
if (!baseSeg) fails.push(`اللافتة بلا مقطع تأسيسيّ: «${res.banner.slice(0, 120)}»`);
if (baseSeg && !/رفعة ثانية تُقارن بها/.test(baseSeg)) fails.push(`مقطع التأسيس بلا ذيل «رفعة ثانية تُقارن بها»: «${baseSeg.trim()}»`);
if (baseSeg && /ملف/.test(baseSeg)) fails.push(`🚨 مقطع التأسيس يحمل ذيل رفع الملفات (الملف مرفوع أصلاً — الناقص رفعة ثانية): «${baseSeg.trim()}»`);
// لا تكرار السبب: «تأسيسية» تظهر مرّة واحدة (في العنوان) لا بعد كل اسم فرع
if ((res.banner.match(/تأسيسية/g) || []).length > 1) fails.push(`تكرار «تأسيسية» ${(res.banner.match(/تأسيسية/g) || []).length} مرّات (السبب يُذكر مرّة): «${res.banner.slice(0, 120)}»`);
// ج-٣ العمود والقيَم
if (!res.heads.includes("اسم الصنف")) fails.push(`جدول المختفي بلا عمود «اسم الصنف»: [${res.heads.join(", ")}]`);
if (res.heads[0] !== "SKU" || res.heads[1] !== "اسم الصنف") fails.push(`ترتيب الأعمدة ليس SKU ثم اسم الصنف: [${res.heads.join(", ")}]`);
const named = res.rows.find(r => r.some(c => c.includes("GONE1")));
const noName = res.rows.find(r => r.some(c => c.includes("GONE2")));
if (!named || !named.some(c => c.includes("مقلاة مفقودة"))) fails.push("صنف مختفٍ باسم لا يعرض اسمه");
if (!noName || !noName.some(c => c.includes("—"))) fails.push("صنف مختفٍ بلا اسم لا يعرض «—» صراحةً");
if (fails.length) { console.error("✗ G-SALES-DISPLAY:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SALES-DISPLAY: ج-١ مقطع التأسيس بذيل «رفعة ثانية تُقارن بها» (لا «تُرفع ملفاتها»، السبب مرّة واحدة) · ج-٣ عمود «اسم الصنف» (اسم · «—»).");
