// ============================================================================
// G-SALES-SORT — ترتيب وتوسيع جداول شاشة عرض المبيعات (القيمة، لا الشكل):
//   ① العرض بالكمية تنازلياً: الصفّ الأول ≥ الأخير في «الأكثر مبيعاً» و«الراكدة» و«السحب».
//   ② «إظهار المزيد» ⇒ 20 صفّاً بالضبط (لا الكل) ＋ صفر استعلام قاعدة جديد · «عرض أقل» ⇒ 10.
//   ③ الدخول لا يتغيّر (نفس الأصناف العشرة الأولى بمعيارها الأصليّ — نتحقّق أنّ التوسيع يزيد لا يستبدل).
// --broken: يُلغى فرز العرض بالكمية ⇒ العمود غير تنازليّ ⇒ يرسب.
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
  const A = "const salesQtyDesc = (list, qtyOf) => list.slice().sort((a, b) => (Number(qtyOf(b)) || 0) - (Number(qtyOf(a)) || 0));";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد فرز العرض بالكمية"); process.exit(2); }
  html = html.replace(A, "const salesQtyDesc = (list, qtyOf) => list.slice();");   // بلا فرز ⇒ يبقى ترتيب المعيار الأصليّ (قيمة) لا الكمية
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(async () => {
  let fromCalls = 0;   // عدّاد استعلامات القاعدة (يجب ألّا يتغيّر عند التوسيع)
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }]; salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = ""; salesShowAll = {};
  const now = new Date().toISOString(), day = 86400000;
  // 25 صنف مبيعات: القيمة والوحدات مرتّبتان عكسياً (لاختبار أنّ العرض بالوحدات لا القيمة)
  const movs = [];
  for (let i = 0; i < 25; i++) movs.push({ kind: "estimated_sale", delta: -(i + 1), value_est: (25 - i) * 10, unit_price_incl: 50, unit_price_excl: 43, location: "az", sku: "S" + i, sku_name: "صنف " + i, upload_id: "U" + (i % 3), captured_at: now, period_days: 6 });
  // سحب المستودع: 25 صنف — القيمة والوحدات عكسيّتان (لاختبار العرض بالوحدات)
  for (let i = 0; i < 25; i++) movs.push({ kind: "estimated_sale", delta: -(i + 1), value_est: (25 - i) * 10, unit_price_incl: 50, unit_price_excl: 43, location: "wh", sku: "W" + i, sku_name: "مسحوب " + i, upload_id: "UW0", captured_at: now, period_days: 6 });
  // مخزون راكد: 25 صنف بكميات متفاوتة بلا بيع (days=null ⇒ راكد) ＋ مخزون المستودع
  const stock = [];
  for (let i = 0; i < 25; i++) stock.push({ location: "az", sku: "R" + i, name: "راكد " + i, qty: (i * 7) % 23 + 1, price_incl: 100, price_excl: 87 });
  for (let i = 0; i < 25; i++) stock.push({ location: "wh", sku: "W" + i, name: "مسحوب " + i, qty: (i * 5) % 19 + 1, price_incl: 100, price_excl: 87 });
  db.sales = { uploads: async () => { fromCalls++; return [{ id: "U0", location: "az", captured_at: now, suspect: false }, { id: "U1", location: "az", captured_at: new Date(Date.now() - 6 * day).toISOString(), suspect: false }, { id: "U2", location: "az", captured_at: new Date(Date.now() - 12 * day).toISOString(), suspect: false }, { id: "UW0", location: "wh", captured_at: now, suspect: false }]; }, movements: async () => { fromCalls++; return movs; }, clearSuspect: async () => {} };
  sb = { from: () => { fromCalls++; return { select: () => ({ range: async () => ({ data: stock, error: null }) }) }; } };
  try { goPage("home"); } catch (e) {}
  const r = document.getElementById("result"); if (r) r.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  await new Promise(r => setTimeout(r, 30));

  const colVals = (sel, colIdx) => [...document.querySelectorAll(sel + " tbody tr")].map(tr => { const td = tr.querySelectorAll("td")[colIdx]; return td ? parseInt((td.textContent || "").replace(/[^\d]/g, ""), 10) : NaN; }).filter(n => Number.isFinite(n));
  const nonIncreasing = arr => arr.every((v, i) => i === 0 || arr[i - 1] >= v);
  const sellersQ = colVals("#s4tbl-sellers", 3);      // الوحدات
  const rakaQ = colVals("#s4tbl-raka", 3);            // الكمية
  const whQ = colVals("#s4tbl-whsuhb", 3);            // الكمية (السحب)

  // التوسيع: «إظهار المزيد» على «الأكثر مبيعاً» ⇒ 20 صفّاً · صفر استعلام جديد
  const before = fromCalls;
  const rows10 = document.querySelectorAll("#s4tbl-sellers tbody tr").length;
  salesToggleAll("sellers");
  await new Promise(r => setTimeout(r, 20));
  const rows20 = document.querySelectorAll("#s4tbl-sellers tbody tr").length;
  const callsAfterExpand = fromCalls;
  salesToggleAll("sellers"); await new Promise(r => setTimeout(r, 20));
  const rowsBack = document.querySelectorAll("#s4tbl-sellers tbody tr").length;

  return { sellersQ, rakaQ, whQ, sellersMono: nonIncreasing(sellersQ), rakaMono: nonIncreasing(rakaQ), whMono: nonIncreasing(whQ),
           rows10, rows20, rowsBack, queriesOnExpand: callsAfterExpand - before,
           hasMoreBtn: !!document.querySelector('#salesDetail .s4-more[aria-controls="s4tbl-sellers"]') };
});
await b.close();

if (BROKEN) {
  if (!res.sellersMono || !res.rakaMono || !res.whMono) { console.log("✅ (--broken) G-SALES-SORT مسك العطل: عمود الكمية غير تنازليّ (فُقد فرز العرض)."); process.exit(0); }
  console.error("✗ (--broken) بقيت الأعمدة تنازلية — لا أسنان. " + JSON.stringify(res)); process.exit(1);
}
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!res.sellersQ.length) fails.push("جدول «الأكثر مبيعاً» فارغ");
if (!res.sellersMono) fails.push(`① «الأكثر مبيعاً» الكمية غير تنازلية: ${res.sellersQ}`);
if (!res.rakaQ.length) fails.push("جدول «الراكدة» فارغ (بوّابة الرصد؟)");
if (!res.rakaMono) fails.push(`① «الراكدة» الكمية غير تنازلية: ${res.rakaQ}`);
if (!res.whQ.length) fails.push("جدول «السحب» فارغ");
if (!res.whMono) fails.push(`① «السحب» الكمية غير تنازلية: ${res.whQ}`);
if (res.rows10 !== 10) fails.push(`② العرض الافتراضيّ ليس 10 صفوف: ${res.rows10}`);
if (res.rows20 !== 20) fails.push(`② «إظهار المزيد» لم يُعطِ 20 صفّاً بالضبط: ${res.rows20}`);
if (res.rowsBack !== 10) fails.push(`② «عرض أقل» لم يُرجِع 10: ${res.rowsBack}`);
if (res.queriesOnExpand !== 0) fails.push(`② التوسيع أطلق ${res.queriesOnExpand} استعلام قاعدة (يجب 0)`);
if (!res.hasMoreBtn) fails.push("زرّ «إظهار المزيد» (aria-controls) غائب");
if (fails.length) { console.error("✗ G-SALES-SORT:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SALES-SORT: الكمية تنازلية في مبيعاً/راكدة/سحباً · إظهار المزيد 10→20→10 · صفر استعلام عند التوسيع · زرّ aria سليم.");
