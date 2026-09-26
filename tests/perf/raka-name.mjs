// ============================================================================
// G-RAKA-NAME — جدول «أكثر 10 راكدة»: اسم المنتج ورؤوس الأعمدة (القيمة، لا الشكل):
//   ① عمود «المنتج» ليس فارغاً في كل الصفوف — الاسم من **المخزون** (الراكد بلا حركة فاسمه يغيب لو من الحركات).
//   ② الاسم غير المتوفّر ⇒ سبب نصّيّ صريح «بلا اسم في المخزون» 🚫 لا شرطة مجرّدة.
//   ③ رؤوس الأعمدة تلتفّ (white-space: normal) فلا «سعر التك…» ولا قصّ أفقيّ للصفحة (@360/@390).
// --broken: اسم الراكد من sMap (الحركات) ⇒ الراكد بلا حركة يعود فارغاً في كل الصفوف ⇒ يرسب.
// --broken-hdr: th يعود nowrap ⇒ رأس مقصوص ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MODE = process.argv.includes("--broken") ? "name" : process.argv.includes("--broken-hdr") ? "hdr" : "";
const BROKEN = !!MODE;
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (MODE === "name") {
  const A = "const ls = lastSale.get(sku), days = ls ? Math.round((now - ls) / 86400000) : null, nm = nameBySku.get(sku) || (sMap.get(sku) || {}).name || \"\",";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد مصدر اسم الراكد"); process.exit(2); }
  html = html.replace(A, "const ls = lastSale.get(sku), days = ls ? Math.round((now - ls) / 86400000) : null, nm = (sMap.get(sku) || {}).name || \"\",");   // من الحركات فقط (العطل)
} else if (MODE === "hdr") {
  const A = "text-align: start; white-space: normal; vertical-align: bottom; line-height: 1.35; }   /* الرأس يلتفّ";
  if (!html.includes(A)) { console.error("✗ (--broken-hdr) لم أجد قاعدة رأس الجدول"); process.exit(2); }
  html = html.replace(A, "text-align: start; white-space: nowrap; vertical-align: bottom; line-height: 1.35; }   /* الرأس يلتفّ");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 900, isMobile: true });
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }]; salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = ""; salesShowAll = {};
  const now = new Date().toISOString();
  const movs = [{ kind: "estimated_sale", delta: -2, value_est: 100, unit_price_incl: 50, unit_price_excl: 43, location: "az", sku: "SOLD1", sku_name: "مباع", upload_id: "U1", captured_at: now, period_days: 15 }];   // رصد 15 يوم (يفتح الجدول)
  const stock = [
    { location: "az", sku: "425026", name: "سرير نوم مزدوج كلاسيك", qty: 26, price_incl: 30, price_excl: 26, cost_price: 20 },   // راكد بلا حركة — اسمه من المخزون
    { location: "az", sku: "R2", name: "خزانة ملابس", qty: 12, price_incl: 40, price_excl: 35, cost_price: 25 },
    { location: "az", sku: "SOLD1", name: "مباع", qty: 5, price_incl: 50, price_excl: 43, cost_price: 30 },
  ];
  db.sales = { uploads: async () => [{ id: "U1", location: "az", captured_at: now, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage(); await new Promise(r => setTimeout(r, 40));
  const card = [...document.querySelectorAll("#salesDetail .s4-tbl")].find(c => /راكدة/.test(c.textContent));
  const rows = card ? [...card.querySelectorAll("tbody tr")] : [];
  const names = rows.map(tr => (tr.querySelectorAll("td")[1].textContent || "").trim());
  const ths = card ? [...card.querySelectorAll("thead th")] : [];
  const clipped = ths.filter(th => th.scrollWidth > th.clientWidth + 1).map(th => th.textContent.trim());
  return { rowCount: rows.length, names, has425: names.includes("سرير نوم مزدوج كلاسيك"), allEmpty: rows.length > 0 && names.every(n => !n || n === "—"), clipped, pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
});
await b.close();

const thWraps = /\.s4-tbl th \{[^}]*white-space: normal/.test(html);   // الرأس يلتفّ (لا nowrap)
if (BROKEN) {
  // على broken-name: الاسم الحقيقيّ (425026) يختفي — الراكد بلا حركة يفقد اسمه (الخليّة تعرض «بلا اسم» أو تفرغ)
  if (MODE === "name" && (!res.has425 || res.allEmpty)) { console.log("✅ (--broken) G-RAKA-NAME مسك العطل: اسم الراكد الحقيقيّ غاب (المصدر الحركات)."); process.exit(0); }
  if (MODE === "hdr" && !thWraps) { console.log("✅ (--broken-hdr) G-RAKA-NAME مسك العطل: رأس الجدول nowrap (لا يلتفّ ⇒ يُقصّ)."); process.exit(0); }
  console.error("✗ (" + MODE + ") لم يُرصَد العطل — لا أسنان. " + JSON.stringify(res)); process.exit(1);
}
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!res.rowCount) fails.push("جدول الراكد فارغ (بوّابة الرصد؟)");
if (res.allEmpty) fails.push(`① عمود «المنتج» فارغ في كل الصفوف: ${JSON.stringify(res.names)}`);
if (!res.has425) fails.push(`① SKU 425026 لا يعرض اسمه الحقيقيّ: ${JSON.stringify(res.names)}`);
if (!thWraps) fails.push("③ رأس الجدول ليس white-space: normal (لا يلتفّ ⇒ يُقصّ «سعر التك…»)");
if (res.clipped.length) fails.push(`③ رؤوس مقصوصة فعلاً: ${res.clipped.join(" · ")}`);
if (res.pageOverflow) fails.push("③ تجاوز أفقيّ للصفحة @390");
if (fails.length) { console.error("✗ G-RAKA-NAME:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-RAKA-NAME: اسم الراكد من المخزون (425026 يظهر) · لا عمود منتج فارغ · الرؤوس تلتفّ بلا قصّ · بلا تجاوز أفقيّ @390.");
