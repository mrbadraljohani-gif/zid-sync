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
  const FIX = "const pCount = list.filter(u => u.priceChanged).length;";
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد عدّاد السعر"); process.exit(2); }
  html = html.replace(FIX, "const pCount = list.filter(u => u.priceChanged || u.pubChanged).length;");   // يُعيد خلط النشر بالسعر (العلّة)
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
  // تجهيزة: أصناف بأعلام معروفة — تشمل صفّ «إعادة نشر فقط» (لا كمية ولا سعر) لاختبار الشمول
  const mk = (sku, q, px, pub) => ({ sku, skuN: sku, name: "صنف " + sku, whName: "و" + sku, img: "", oldQty: 1, newQty: q ? 9 : 1, oldPrice: 100, newPrice: px ? 200 : 100, whBase: px ? 200 : 100, offset: 0, qtyChanged: q, priceChanged: px, pubChanged: pub, republish: pub, excluded: false });
  lastUpdated = [
    mk("A", true, false, false),   // كمية فقط
    mk("B", false, true, false),   // سعر فقط
    mk("C", true, true, false),    // كمية ＋ سعر ⇒ الاثنان
    mk("D", false, false, true),   // نشر فقط ⇒ «النشر» لا «السعر» (جوهر التعديل)
    mk("E", true, false, true),    // كمية ＋ نشر
  ];
  currentFilter = "updated"; updChgFilter = "all";
  // اجعل qtyRows/priceRows بقيم معروفة لنتأكّد أن الفلتر لا يمسّها
  qtyRows = [["h"], ["A", 9], ["C", 9], ["E", 9]]; priceRows = [["h"], ["B"], ["C"], ["D"], ["E"]];
  const qBefore = JSON.stringify(qtyRows), pBefore = JSON.stringify(priceRows);
  document.getElementById("detailTable").innerHTML = updatedTableHTML(lastUpdated);
  // اقرأ عدّادات الشرائح الخمس: الكل · الكمية · السعر · النشر · الاثنان
  const num = i => { const b = document.querySelectorAll(".upd-filter .upd-chip")[i].querySelector("b"); return Number(b.textContent); };
  const all = num(0), qty = num(1), price = num(2), pub = num(3), both = num(4);
  const disabled = [...document.querySelectorAll(".upd-filter .upd-chip")].map(b => b.disabled);
  const shownOf = () => [...document.querySelectorAll("#unBody > tr")].filter(tr => tr.style.display !== "none").map(tr => tr.getAttribute("data-search"));
  const usEl = document.getElementById("unSearch"); if (usEl) usEl.value = "";
  setUpdFilter("price"); const shownPrice = shownOf();     // يجب B,C فقط (لا D النشر-فقط)
  setUpdFilter("pub"); const shownPub = shownOf();         // يجب D,E
  setUpdFilter("both"); const shownBoth = shownOf().length;
  setUpdFilter("qty"); if (usEl) { usEl.value = "A"; filterUnmatched(); }
  const shownQtyA = shownOf().length;
  return { all, qty, price, pub, both, disabled, shownPrice, shownPub, shownBoth, shownQtyA, qAfter: JSON.stringify(qtyRows), pAfter: JSON.stringify(priceRows), qBefore, pBefore };
});
await b.close();
const fails = [];
// ① العدّادات (لا شمول/استبعاد — التداخل مقصود)
if (res.all !== 5) fails.push(`الكل=${res.all} (متوقّع 5)`);
if (res.qty !== 3) fails.push(`الكمية=${res.qty} (متوقّع 3: A,C,E)`);
if (res.price !== 2) fails.push(`السعر=${res.price} (متوقّع 2: B,C — النشر-فقط D لا يُحسب سعراً)`);
if (res.pub !== 2) fails.push(`النشر=${res.pub} (متوقّع 2: D,E)`);
if (res.both !== 1) fails.push(`الاثنان=${res.both} (متوقّع 1: C — كمية∩سعر)`);
// ② الجوهر: «السعر» تعرض B,C ولا تعرض D (النشر-فقط)
if (res.shownPrice.some(s => /صنف d/i.test(s))) fails.push("«السعر» عرضت D (نشر فقط) — لم يُفصل النشر عن السعر");
if (!res.shownPrice.some(s => /صنف b/i.test(s)) || res.shownPrice.length !== 2) fails.push(`«السعر» عرضت ${res.shownPrice.length} (متوقّع 2: B,C)`);
// «النشر» تعرض D,E
if (res.shownPub.length !== 2 || !res.shownPub.some(s => /صنف d/i.test(s))) fails.push(`«النشر» عرضت ${res.shownPub.length} (متوقّع 2: D,E)`);
// ③ عرض محض
if (res.qAfter !== res.qBefore) fails.push("setUpdFilter غيّر qtyRows (يجب عرضاً محضاً)");
if (res.pAfter !== res.pBefore) fails.push("setUpdFilter غيّر priceRows (يجب عرضاً محضاً)");
if (res.disabled.some(Boolean)) fails.push("شريحة عُطّلت رغم عدّها >0");
// ④ الفلتر ＋ البحث
if (res.shownBoth !== 1) fails.push(`فلتر «الاثنان» عرض ${res.shownBoth} (متوقّع 1)`);
if (res.shownQtyA !== 1) fails.push(`فلتر «الكمية» ＋ بحث «A» عرض ${res.shownQtyA} (متوقّع 1 — التقاطع)`);
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-FILT مسك خلط النشر بالسعر: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إعادة خلط النشر بالسعر — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-FILT:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-FILT: الكمية ${res.qty} · السعر ${res.price} (لا نشر) · النشر ${res.pub} · الاثنان ${res.both} · عرض محض · فلتر×بحث يتقاطعان.`);
