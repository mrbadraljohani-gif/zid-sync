// ============================================================================
// G-TOTALS — تجاهل صفوف المجاميع بمطابقة الاسم **التامّة** (لا includes).
//   ① صفّ اسمه «المجموع»/«الإجمالي»/«Total» يُستبعَد من parseInvRows (＋ totalsSkipped).
//   ② صنف حقيقيّ يحوي الكلمة («مجموعة سكاكين المحترف») **يبقى** — المطابقة تامّة لا جزئية.
//   ③ الأصناف العادية لا تتأثّر.
// --broken: يبدّل المطابقة التامّة (===) إلى includes ⇒ «مجموعة سكاكين» يُحذف ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BROKEN = process.argv.includes("--broken");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  const FIX = "if (name && INV_TOTALS_NAMES.has(normHead(name))) { totalsSkipped++; continue; }";
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد سطر فلتر المجاميع"); process.exit(2); }
  // includes بدل المطابقة التامّة: أي اسم يحوي «مجموع» يُحذف
  html = html.replace(FIX, "if (name && normHead(name).includes('مجموع')) { totalsSkipped++; continue; }");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  // أول صفّ رأس (كود · اسم · كمية) ثم صفوف بيانات — بالرؤوس الحقيقية
  const aoa = [
    ["رقم الصنف", "اسم الصنف", "الكمية"],
    ["1001", "مسبحة كهرمان", 5],
    ["2002", "مجموعة سكاكين المحترف مقبض بلاستيك", 8],   // صنف حقيقيّ — يجب أن يبقى
    ["2003", "مجموعة سكاكين 5قطع يد خشب", 3],            // صنف حقيقيّ — يجب أن يبقى
    ["1168", "المجموع", 182337],                          // مجاميع — يُستبعَد
    ["3330", "الإجمالي", 44247],                          // مجاميع — يُستبعَد
    ["9", "Total", 999],                                  // مجاميع — يُستبعَد
  ];
  const list = parseInvRows(aoa);
  const codes = list.map(x => String(x.code));
  return { codes, skipped: list.totalsSkipped };
});
await b.close();
const fails = [];
// ② الأصناف الحقيقية باقية
for (const c of ["1001", "2002", "2003"]) if (!res.codes.includes(c)) fails.push(`صنف حقيقيّ ${c} حُذف بالخطأ (مطابقة جزئية؟)`);
// ① صفوف المجاميع مُستبعَدة
for (const c of ["1168", "3330", "9"]) if (res.codes.includes(c)) fails.push(`صفّ مجاميع ${c} لم يُستبعَد`);
if (res.skipped !== 3) fails.push(`totalsSkipped=${res.skipped} (متوقّع 3)`);
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-TOTALS مسك المطابقة الجزئية: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد تحويلها includes — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-TOTALS:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-TOTALS: استُبعد 3 صفوف مجاميع · «مجموعة سكاكين» ×2 بقيا · العادية سليمة (مطابقة تامّة).`);
