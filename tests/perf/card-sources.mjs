// ============================================================================
// G-CARDSRC (تفصيل المصادر في بطاقة المطابقة) — يفحص **القيمة** لا وجود العنصر.
//   ① بطاقة صنف مرشّحه بكود له 6 في فرع و11 في آخر ⇒ يظهر «المصادر: العزيزية 6 · الخضرة 11»
//      بالأرقام والأسماء الفعلية · مصدر واحد ⇒ لا سطر · غائب ⇒ «غائب عن كل المصادر».
//   ② أسعار مختلفة ⇒ «⚠ أسعار مختلفة: 100 / 120» بالأرقام · >3 ⇒ «⚠ N أسعار مختلفة».
//   ③ نفس sourceBreakdown (لا تكرار) — عرضٌ محض.
// --broken: يجعل srcLineCompact يعرض «مصادر متعددة» ثابتاً بلا أرقام ⇒ يرسب (لا قيمة).
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
  const FIX = 'return `<div class="mc-src">المصادر: <span class="mc-src-list">${nz.map(s => `${esc(s.name)} ${s.qty}`).join(" · ")}</span>${priceHtml}</div>`;';
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد سطر بناء المصادر"); process.exit(2); }
  html = html.replace(FIX, 'return `<div class="mc-src">مصادر متعددة</div>`;');   // بلا أرقام
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  invBranches = [{ id: "az", name: "العزيزية", item_count: 1 }, { id: "kh", name: "الخضرة", item_count: 1 }];
  mergeWh = [{ code: "X", name: "صنف", qty: 0, incl: 100, excl: "", bar: "" }];
  const render = (code) => {
    // نمرّر srcLineCompact مباشرةً (نفس ما يستدعيه batchWhInner) — يفحص العرض الفعلي
    const div = document.createElement("div"); div.innerHTML = srcLineCompact(code); return div.textContent.trim();
  };
  // حالة أ: 6 + 11 بسعرين مختلفين
  mergeBranches = [
    [{ code: "X", name: "صنف", qty: 6, incl: 100, excl: "", bar: "", bid: "az" }],
    [{ code: "X", name: "صنف", qty: 11, incl: 120, excl: "", bar: "", bid: "kh" }],
  ];
  const two = render("X");
  // حالة ب: مصدر واحد فقط
  mergeBranches = [[{ code: "X", name: "صنف", qty: 6, incl: 100, excl: "", bar: "", bid: "az" }]]; mergeWh = [];
  const one = render("X");
  // حالة ج: غائب
  const absent = render("ZZZ");
  // حالة د: >3 أسعار مختلفة
  invBranches = [{ id: "a", name: "أ", item_count: 1 }, { id: "b", name: "ب", item_count: 1 }, { id: "c", name: "ج", item_count: 1 }, { id: "d", name: "د", item_count: 1 }];
  mergeBranches = [
    [{ code: "X", qty: 1, incl: 100, bid: "a" }], [{ code: "X", qty: 1, incl: 110, bid: "b" }],
    [{ code: "X", qty: 1, incl: 120, bid: "c" }], [{ code: "X", qty: 1, incl: 130, bid: "d" }],
  ];
  const many = render("X");
  return { two, one, absent, many };
});
await b.close();
const fails = [];
// ① القيمة الفعلية: الأسماء والأرقام
if (!/العزيزية\s*6/.test(res.two) || !/الخضرة\s*11/.test(res.two)) fails.push(`لا «العزيزية 6 · الخضرة 11» بالأرقام: «${res.two}»`);
// ② الأسعار المختلفة بالأرقام
if (!/100\s*\/\s*120/.test(res.two)) fails.push(`لا «100 / 120» في الأسعار المختلفة: «${res.two}»`);
// مصدر واحد ⇒ لا سطر
if (res.one !== "") fails.push(`مصدر واحد يجب ألّا يعرض سطراً — جاء «${res.one}»`);
// غائب ⇒ رسالة
if (!/غائب عن كل المصادر/.test(res.absent)) fails.push(`الغائب يجب أن يقول «غائب عن كل المصادر» — جاء «${res.absent}»`);
// >3 أسعار ⇒ عدد لا قائمة
if (!/4 أسعار مختلفة/.test(res.many)) fails.push(`>3 أسعار يجب أن تقول «4 أسعار مختلفة» — جاء «${res.many}»`);
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-CARDSRC مسك فقدان القيمة: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إزالة الأرقام — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-CARDSRC:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-CARDSRC: «${res.two}» · مصدر واحد بلا سطر · غائب برسالة · >3 أسعار بعدد.`);
