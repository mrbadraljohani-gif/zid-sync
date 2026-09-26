// ============================================================================
// G-SQ-COST — شارة سعر التكلفة في منسدلة «ابحث عن منتج» (شاشة المبيعات) — القيمة لا الشكل:
//   ① owner/marketing: شارتان متجاورتان «شامل: N ر.س» ＋ «تكلفة: N ر.س» ＋ aria صريح لكلٍّ.
//   ② التكلفة عند عدّة مواقع = **قيمة المستودع أولاً** (لا متوسّط/جمع)؛ اختلافها ⇒ tooltip «تختلف بين المواقع».
//   ③ بلا تكلفة ⇒ «تكلفة: —» لا «تكلفة: 0» ولا إخفاء الشارة.
//   ④ 🔒 دور غير owner/marketing (admin/viewer) ⇒ 🚫 لا شارة تكلفة إطلاقاً.
// --broken: تُعرض شارة التكلفة لكل الأدوار (بلا بوّابة canSeeSales) ⇒ admin يراها ⇒ يرسب.
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
  const A = "  if (canSeeSales()) {";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد بوّابة canSeeSales لشارة التكلفة"); process.exit(2); }
  html = html.replace(A, "  if (true) {");   // بلا بوّابة ⇒ تظهر لكل الأدوار
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { if (/^https?:/.test(r.url())) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(() => {
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
  salesAllLocs = () => [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
  salesCtx = { stock: [
    { location: "wh", sku: "90135", name: "سجاد", qty: 5, price_incl: 20, price_excl: 17, cost_price: 12 },
    { location: "az", sku: "90135", name: "سجاد", qty: 3, price_incl: 20, price_excl: 17, cost_price: 12 },
    { location: "wh", sku: "90200", name: "مخدة", qty: 2, price_incl: 30, price_excl: 26, cost_price: 18 },   // المستودع 18
    { location: "az", sku: "90200", name: "مخدة", qty: 4, price_incl: 30, price_excl: 26, cost_price: 25 },   // الفرع 25 (مختلف)
    { location: "az", sku: "90300", name: "سرير", qty: 3, price_incl: 50, price_excl: 43, cost_price: 40 },   // بلا مستودع ⇒ أوّل موقع له قيمة
    { location: "az", sku: "390135", name: "جوز", qty: 1, price_incl: 40, price_excl: 35, cost_price: null }, // بلا تكلفة
  ] };
  const asOwner = sku => { myRole = "owner"; return sqBadgeRow(sku); };
  const asAdmin = sku => { myRole = "admin"; return sqBadgeRow(sku); };
  const asViewer = sku => { myRole = "viewer"; return sqBadgeRow(sku); };
  const asMkt = sku => { myRole = "marketing"; return sqBadgeRow(sku); };
  return {
    o90135: asOwner("90135"), o90200: asOwner("90200"), o90300: asOwner("90300"), o390135: asOwner("390135"),
    mkt90135: asMkt("90135"), admin90135: asAdmin("90135"), viewer90135: asViewer("90135"),
  };
});
await b.close();
const has = (h, re) => re.test(h);
if (BROKEN) {
  if (has(res.admin90135, /تكلفة:/)) { console.log("✅ (--broken) G-SQ-COST مسك العطل: شارة التكلفة ظهرت لدور admin (بلا بوّابة الدور)."); process.exit(0); }
  console.error("✗ (--broken) لم تظهر لـadmin — لا أسنان."); process.exit(1);
}
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
// ① شارتان + aria
if (!has(res.o90135, /شامل:\s*<bdi[^>]*>20/)) fails.push("① شارة «شامل: 20» غائبة");
if (!has(res.o90135, /تكلفة:\s*<bdi[^>]*>12/)) fails.push("① شارة «تكلفة: 12» غائبة");
if (!has(res.o90135, /aria-label="السعر شامل الضريبة 20 ريال"/)) fails.push("① aria السعر الشامل غائب/خاطئ");
if (!has(res.o90135, /aria-label="سعر التكلفة 12 ريال"/)) fails.push("① aria سعر التكلفة غائب/خاطئ");
// التجاور: التكلفة بعد الشامل مباشرةً
if (res.o90135.indexOf("تكلفة:") < res.o90135.indexOf("شامل:")) fails.push("① التكلفة ليست بجوار/بعد الشامل");
// ② المستودع أولاً + tooltip عند الاختلاف
if (!has(res.o90200, /تكلفة:\s*<bdi[^>]*>18/)) fails.push("② التكلفة عند الاختلاف ليست قيمة المستودع (18)");
if (has(res.o90200, /تكلفة:\s*<bdi[^>]*>(?:22|21|43)\b/)) fails.push("② عُرض متوسّط/مجموع بدل قيمة موقع واحد");
if (!has(res.o90200, /التكلفة تختلف بين المواقع — المعروضة من العزيزية|التكلفة تختلف بين المواقع — المعروضة من المستودع/)) fails.push("② tooltip الاختلاف غائب");
if (!has(res.o90200, /cost-diff/)) fails.push("② علامة الاختلاف (cost-diff) غائبة");
if (!has(res.o90135, /التكلفة تختلف/)) { /* الموحّد بلا tooltip — تأكيد سلبيّ */ } else fails.push("② صنف تكلفته موحّدة أظهر tooltip اختلاف");
// المستودع غائب ⇒ أوّل موقع له قيمة (90300: العزيزية 40)
if (!has(res.o90300, /تكلفة:\s*<bdi[^>]*>40/)) fails.push("② بلا مستودع: لم تُؤخذ تكلفة أوّل موقع (40)");
// ③ بلا تكلفة ⇒ «—» لا 0
if (!has(res.o390135, /تكلفة: —/)) fails.push("③ «تكلفة: —» غائبة للصنف بلا تكلفة");
if (has(res.o390135, /تكلفة:\s*<bdi[^>]*>0/)) fails.push("③ عُرضت «تكلفة: 0» بدل «—»");
// ④ الدور
if (!has(res.mkt90135, /تكلفة:/)) fails.push("④ marketing لا يرى شارة التكلفة (يجب أن يراها)");
if (has(res.admin90135, /تكلفة:/)) fails.push("④ admin يرى شارة التكلفة (يجب حجبها)");
if (has(res.viewer90135, /تكلفة:/)) fails.push("④ viewer يرى شارة التكلفة (يجب حجبها)");
// السعر (شامل) يبقى لكل الأدوار (ليس تكلفة)
if (!has(res.admin90135, /شامل:/)) fails.push("④ admin فقد شارة السعر الشامل (يجب أن تبقى)");
if (fails.length) { console.error("✗ G-SQ-COST:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SQ-COST: «شامل»＋«تكلفة» متجاورتان بـaria · المستودع أولاً (لا متوسّط) ＋ tooltip الاختلاف · بلا تكلفة «—» · owner/marketing فقط.");
