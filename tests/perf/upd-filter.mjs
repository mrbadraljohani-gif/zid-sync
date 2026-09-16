// ============================================================================
// G-FILT (فلتر جدول «تم تحديثه») — عرض محض، شمول واستبعاد.
//   ① عدّادات الشرائح: |الكمية| + |السعر| − |الاثنان| == |الكل| (كل صفّ ∈ كمية∪سعر).
//   ② الفلتر عرضٌ محض: setUpdFilter لا يمسّ qtyRows/priceRows (طول ومحتوى ثابتان).
//   ③ شريحة عدّها صفر ⇒ معطّلة (disabled) لا مخفيّة.
//   ④ الفلتر ＋ البحث يعملان معاً (تقاطع، لا يلغي أحدهما الآخر).
// --broken: يُسقط republish من عدّاد «السعر» ⇒ صفّ إعادة النشر يفلت ⇒ المجموع ≠ الكل ⇒ يرسب.
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
  const FIX = "const pxCount = list.filter(u => u.priceChanged || u.republish).length;";
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد عدّاد السعر لإسقاط republish"); process.exit(2); }
  html = html.replace(FIX, "const pxCount = list.filter(u => u.priceChanged).length;");   // يُسقط إعادة النشر
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
  // تجهيزة: أصناف بأعلام معروفة — تشمل صفّ «إعادة نشر فقط» (لا كمية ولا سعر) لاختبار الشمول
  const mk = (sku, q, px, rep) => ({ sku, skuN: sku, name: "صنف " + sku, whName: "و" + sku, img: "", oldQty: 1, newQty: q ? 9 : 1, oldPrice: 100, newPrice: px ? 200 : 100, whBase: px ? 200 : 100, offset: 0, qtyChanged: q, priceChanged: px, republish: rep, excluded: false });
  lastUpdated = [
    mk("A", true, false, false),   // كمية فقط
    mk("B", false, true, false),   // سعر فقط
    mk("C", true, true, false),    // الاثنان
    mk("D", false, false, true),   // إعادة نشر فقط ⇒ يُحسب «سعر» (أثّر في ملف الأسعار)
    mk("E", true, false, true),    // كمية ＋ إعادة نشر ⇒ الاثنان
  ];
  currentFilter = "updated"; updChgFilter = "all";
  // اجعل qtyRows/priceRows بقيم معروفة لنتأكّد أن الفلتر لا يمسّها
  qtyRows = [["h"], ["A", 9], ["C", 9], ["E", 9]]; priceRows = [["h"], ["B"], ["C"], ["D"], ["E"]];
  const qBefore = JSON.stringify(qtyRows), pBefore = JSON.stringify(priceRows);
  document.getElementById("detailTable").innerHTML = updatedTableHTML(lastUpdated);
  // اقرأ عدّادات الشرائح من الأزرار المرسومة
  const num = i => { const b = document.querySelectorAll(".upd-filter .upd-chip")[i].querySelector("b"); return Number(b.textContent); };
  const all = num(0), qty = num(1), price = num(2), both = num(3);
  const disabled = [...document.querySelectorAll(".upd-filter .upd-chip")].map(b => b.disabled);
  // ② فلترة «الاثنان» ثم تحقّق: صفوف معروضة == b فقط، وqtyRows/priceRows لم تتغيّر
  const usEl = document.getElementById("unSearch"); if (usEl) usEl.value = "";
  setUpdFilter("both");
  const shownBoth = [...document.querySelectorAll("#unBody > tr")].filter(tr => tr.style.display !== "none").length;
  // ④ فلتر ＋ بحث: «الكمية» ＋ بحث «A» ⇒ صفّ واحد
  setUpdFilter("qty"); if (usEl) { usEl.value = "A"; filterUnmatched(); }
  const shownQtyA = [...document.querySelectorAll("#unBody > tr")].filter(tr => tr.style.display !== "none").length;
  return { all, qty, price, both, disabled, shownBoth, shownQtyA, qAfter: JSON.stringify(qtyRows), pAfter: JSON.stringify(priceRows), qBefore, pBefore };
});
await b.close();
const fails = [];
// ① الشمول والاستبعاد
if (res.qty + res.price - res.both !== res.all) fails.push(`الشمول/الاستبعاد: الكمية(${res.qty}) + السعر(${res.price}) − الاثنان(${res.both}) = ${res.qty + res.price - res.both} ≠ الكل(${res.all})`);
if (res.all !== 5) fails.push(`الكل=${res.all} (متوقّع 5)`);
if (res.qty !== 3) fails.push(`الكمية=${res.qty} (متوقّع 3: A,C,E)`);
if (res.price !== 4) fails.push(`السعر=${res.price} (متوقّع 4: B,C,D,E — إعادة النشر D وE تُحسب سعراً)`);
if (res.both !== 2) fails.push(`الاثنان=${res.both} (متوقّع 2: C,E)`);
// ② عرض محض
if (res.qAfter !== res.qBefore) fails.push("setUpdFilter غيّر qtyRows (يجب عرضاً محضاً)");
if (res.pAfter !== res.pBefore) fails.push("setUpdFilter غيّر priceRows (يجب عرضاً محضاً)");
// ③ لا شريحة صفرية هنا (كلها >0) فكلها مفعّلة
if (res.disabled.some(Boolean)) fails.push("شريحة عُطّلت رغم عدّها >0");
// ④ الفلتر يعمل ＋ يتقاطع مع البحث
if (res.shownBoth !== 2) fails.push(`فلتر «الاثنان» عرض ${res.shownBoth} صفّاً (متوقّع 2)`);
if (res.shownQtyA !== 1) fails.push(`فلتر «الكمية» ＋ بحث «A» عرض ${res.shownQtyA} (متوقّع 1 — التقاطع)`);
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-FILT مسك خلل الشمول: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إسقاط republish — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-FILT:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-FILT: الكمية ${res.qty} ＋ السعر ${res.price} − الاثنان ${res.both} = الكل ${res.all} · عرض محض (qtyRows/priceRows ثابتان) · فلتر×بحث يتقاطعان.`);
