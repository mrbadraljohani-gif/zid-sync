// ============================================================================
// G-SALES-NOPRICE — جدول «مقارنة المواقع»: «0 ر.س» تكذب حين باع الموقع بلا سعر (القيمة، لا الشكل):
//   ① موقع كل بيعه بلا سعر (units>0، val=0) ⇒ «— بلا سعر» لا «0 ر.س» (الشرطة صدق).
//   ② موقع بلا حركات بيع فعلاً (units=0) ⇒ «0 ر.س» كما هو.
//   ③ موقع مختلط (val>0 مع أصناف بلا سعر) ⇒ المجموع المعروف ＋ «جزئيّ — N صنفاً بلا سعر».
//   ④ صفّ الإجمالي يتبع القاعدة نفسها (جزئيّ بعدد الاتحاد).
//   ⑤ عرضٌ بحت: الوحدات/المتحرّكة/المخزون بلا مساس (كل موقع أرقامه ثابتة).
// --broken: يُلغى فرع «— بلا سعر» ⇒ الموقع بلا سعر يعود «0 ر.س» ⇒ يرسب.
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
  const A = 'if (units > 0 && v === 0 && npSku > 0) inner = `— <span class="cmp-u">بلا سعر</span>`;';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد فرع «— بلا سعر»"); process.exit(2); }
  html = html.replace(A, "if (false) inner = null;");   // يعود «0 ر.س» (العطل)
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 1000, isMobile: true });
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }]; salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = ""; salesHiddenLines = new Set();
  salesAllLocs = () => [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }, { id: "haraj_maf", name: "الحراج مفروشات" }, { id: "haraj_reh", name: "الحراج رحلات" }];
  const iso = t => new Date(t).toISOString(), day = 86400000, now = Date.now();
  const cap = iso(now - day);   // رفعة واحدة لكل موقع (business_date قبلها)
  // az: بيعان مسعّران · kh: بيعان بلا سعر · haraj_reh: مسعّر ＋ بلا سعر · haraj_maf: شراء فقط (بلا بيع)
  const S = (loc, sku, delta, vinc) => ({ kind: "estimated_sale", delta, value_est: vinc == null ? null : Math.abs(delta) * vinc, unit_price_incl: vinc, unit_price_excl: vinc == null ? null : vinc - 5, location: loc, sku, sku_name: sku, upload_id: "U_" + loc, captured_at: cap, period_days: 1 });
  const movs = [
    S("az", "A1", -3, 100), S("az", "A2", -2, 50),
    S("kh", "K1", -4, null), S("kh", "K2", -1, null),
    S("haraj_reh", "R1", -2, 80), S("haraj_reh", "R2", -5, null),
    { kind: "purchase", delta: 5, value_est: null, unit_price_incl: null, unit_price_excl: null, location: "haraj_maf", sku: "M1", sku_name: "M1", upload_id: "U_haraj_maf", captured_at: cap, period_days: 1 },
  ];
  const stock = [{ location: "az", sku: "A1", name: "A1", qty: 5, price_incl: 100, price_excl: 95 }];
  db.sales = { uploads: async () => ["az", "kh", "haraj_reh", "haraj_maf"].map(l => ({ id: "U_" + l, location: l, captured_at: cap, suspect: false })), movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("sales"); } catch (e) {}
  await renderSalesPage(); await new Promise(r => setTimeout(r, 60));
  const tbl = document.getElementById("salesCmp");
  const cell = (loc) => { const tr = [...tbl.querySelectorAll("tbody tr")].find(t => new RegExp(loc).test((t.querySelector(".cmp-loc") || {}).textContent || "")); if (!tr) return null; const c = tr.querySelectorAll("td")[1]; const front = c.querySelector(".cmp-front") || c; return { txt: (front.textContent || "").replace(/\s+/g, " ").trim(), units: ((tr.querySelectorAll("td")[2] || {}).textContent || "").trim() }; };
  const totTr = [...tbl.querySelectorAll("tbody tr.total")][0];
  const totCell = totTr ? (totTr.querySelectorAll("td")[1].querySelector(".cmp-front") || totTr.querySelectorAll("td")[1]).textContent.replace(/\s+/g, " ").trim() : "";
  return { az: cell("العزيزية"), kh: cell("الخضرة"), reh: cell("رحلات"), maf: cell("مفروشات"), tot: totCell };
});
await b.close();

if (BROKEN) {
  // العطل: الخضرة (كل بيعها بلا سعر) تعرض «0» بدل «— بلا سعر»
  const caught = res.kh && !/بلا سعر/.test(res.kh.txt) && /\b0\b/.test(res.kh.txt);
  if (caught) { console.log("✅ (--broken) G-SALES-NOPRICE مسك العطل: الموقع بلا سعر يعرض «0 ر.س» بدل «— بلا سعر»."); process.exit(0); }
  console.error("✗ (--broken) لم يُرصَد العطل — لا أسنان. " + JSON.stringify(res)); process.exit(1);
}
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!res.kh) fails.push("الخضرة غائبة عن الجدول (تجهيزة)");
else { if (!/بلا سعر/.test(res.kh.txt)) fails.push(`① الخضرة (كل بيعها بلا سعر) لا تعرض «بلا سعر»: «${res.kh.txt}»`); if (!/—/.test(res.kh.txt)) fails.push(`① الخضرة بلا شرطة: «${res.kh.txt}»`); if (res.kh.units === "0") fails.push("① الخضرة units=0 (يجب أن تبيع فعلاً)"); }
if (!res.az || /بلا سعر|جزئيّ/.test(res.az.txt) || !/\d/.test(res.az.txt)) fails.push(`② العزيزية (كلها مسعّرة) يجب أن تعرض مبلغاً نظيفاً: «${res.az && res.az.txt}»`);
if (!res.maf) fails.push("③ الحراج مفروشات غائب");
else if (/بلا سعر/.test(res.maf.txt) || !/\b0\b/.test(res.maf.txt)) fails.push(`② الحراج مفروشات (بلا بيع) يجب «0 ر.س»: «${res.maf.txt}»`);
if (!res.reh || !/جزئيّ/.test(res.reh.txt) || !/1\s*صنف/.test(res.reh.txt)) fails.push(`③ الحراج رحلات (مختلط) يجب «جزئيّ — 1 صنفاً بلا سعر»: «${res.reh && res.reh.txt}»`);
if (!/جزئيّ/.test(res.tot) || !/3\s*صنف/.test(res.tot)) fails.push(`④ الإجمالي يجب «جزئيّ — 3 صنفاً بلا سعر»: «${res.tot}»`);
if (fails.length) { console.error("✗ G-SALES-NOPRICE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-SALES-NOPRICE: الخضرة «${res.kh.txt}» (— بلا سعر) · العزيزية «${res.az.txt}» · مفروشات «${res.maf.txt}» (0 حقيقيّ) · رحلات «${res.reh.txt}» (جزئيّ) · الإجمالي «${res.tot}».`);
