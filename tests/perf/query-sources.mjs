// ============================================================================
// G-SRC (تفصيل مصادر الاستعلام) — عرضٌ محض من mergeWh/mergeBranches.
//   ① sourceBreakdown(code): كود بكمية 6 في فرع و11 في آخر ⇒ total=17 وتفصيل «6 · 11»
//      بأسماء الفروع (من invBranches)، والمستودع 0 يُخفى في العرض.
//   ② التفصيل لا يغيّر أي مخرج: mergeInventory(mergeWh, mergeBranches) نفسه (bid مُتجاهَل).
//   ③ سعر مختلف بين المصدرين ⇒ يظهر مع كلٍّ؛ موحّد ⇒ مرّة.
//   ④ غائب عن كل المصادر ⇒ رسالة صريحة لا سطر فارغ.
// --broken: يجمع كل الفروع في مصدر واحد (يتجاهل bid) ⇒ يختفي التفصيل «6 · 11» ⇒ يرسب.
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
  // اجمع كل الفروع في مصدر واحد (تجاهل bid) — يعيد سلوك الموحّد المدموج
  const FIX = 'add(it.bid || ("?" + it.code), nameById[it.bid] || "فرع", 1, it);';
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد سطر إضافة الفرع لتعطيل bid"); process.exit(2); }
  html = html.replace(FIX, 'add("__allbr", "فرع", 1, it);');
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  // العزيزية أقدم، الخضرة أحدث. كود X: العزيزية 6 (سعر 100) · الخضرة 11 (سعر 120) · المستودع 0
  invBranches = [{ id: "az", name: "العزيزية", item_count: 1 }, { id: "kh", name: "الخضرة", item_count: 1 }];
  mergeWh = [{ code: "X", name: "صنف", qty: 0, incl: 100, excl: "", bar: "" }];
  mergeBranches = [
    [{ code: "X", name: "صنف", qty: 6, incl: 100, excl: "", bar: "", bid: "az" }],
    [{ code: "X", name: "صنف", qty: 11, incl: 120, excl: "", bar: "", bid: "kh" }],
  ];
  const bd = sourceBreakdown("X");
  // ② ثبات المخرج: الموحّد نفسه
  const uni = mergeInventory(mergeWh, mergeBranches);
  const xu = [...uni.unified, ...uni.noPrice].find(r => r.code === "X");
  // ④ غائب
  const absent = sourceBreakdown("ZZZ");
  return {
    total: bd.total,
    src: bd.sources.map(s => ({ name: s.name, qty: s.qty, price: s.price })),
    uniTotalQty: xu ? xu.qty : null,
    absentSrc: absent.sources.length,
  };
});
await b.close();
const fails = [];
const nz = res.src.filter(s => s.qty > 0);
// ① الإجمالي والتفصيل
if (res.total !== 17) fails.push(`الإجمالي=${res.total} (متوقّع 17 = 6+11)`);
if (nz.length !== 2) fails.push(`مصادر بكمية=${nz.length} (متوقّع 2: العزيزية، الخضرة — المستودع 0 لا يُعدّ)`);
const az = res.src.find(s => s.name === "العزيزية"), kh = res.src.find(s => s.name === "الخضرة");
if (!az || az.qty !== 6) fails.push(`العزيزية=${az && az.qty} (متوقّع 6)`);
if (!kh || kh.qty !== 11) fails.push(`الخضرة=${kh && kh.qty} (متوقّع 11)`);
// ② ثبات المخرج
if (res.uniTotalQty !== 17) fails.push(`الموحّد المدموج X=${res.uniTotalQty} (متوقّع 17 — التفصيل لم يغيّر المخرج)`);
// ③ الأسعار مختلفة (100 vs 120) محفوظة لكل مصدر
if (!az || az.price !== 100 || !kh || kh.price !== 120) fails.push(`أسعار المصادر ${az && az.price}/${kh && kh.price} (متوقّع 100/120 — تكشف اختلاف الإدخال)`);
// ④ غائب
if (res.absentSrc !== 0) fails.push(`كود غائب أعاد ${res.absentSrc} مصدراً (متوقّع 0 ⇒ رسالة «غائب عن كل المصادر»)`);
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-SRC مسك فقدان التفصيل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد جمع الفروع في مصدر واحد — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-SRC:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-SRC: الإجمالي 17 · العزيزية 6 (100) · الخضرة 11 (120) · المستودع 0 مخفيّ · الموحّد ثابت (17) · الغائب رسالة.`);
