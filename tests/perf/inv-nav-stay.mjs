// ============================================================================
// G-NAV (دفعة ٢) — بعد رفعة ناجحة **تبقى الصفحة الحالية كما هي** والمطابقة تُعاد في الخلفية.
//   العلّة القديمة: launchMatchIfReady كان ينتقل تلقائياً إلى الرئيسية (goPage("home"))
//   فيُقطَع المستخدم عن رفع بقيّة الملفات. المطلوب: لا انتقال · run() يعمل · النتيجة جاهزة.
// يتحقّق (المستخدم في صفحة «تحديث قاعدة البيانات»): بعد launchMatchIfReady تبقى الصفحة db
//   ويُستدعى run (المطابقة أُعيدت). يشمل مساري المخزون وزد (كلاهما عبر فرع stData نفسه).
// --broken: يعيد goPage("home") إلى launchMatchIfReady ⇒ الصفحة تصير home ⇒ يرسب.
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
  const FIX = "if (stData) {\n    run();   // تُعاد المطابقة على المدخل الكامل";
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد فرع stData لإعادة الانتقال"); process.exit(2); }
  html = html.replace(FIX, 'if (stData) {\n    goPage("home");\n    run();   // تُعاد المطابقة على المدخل الكامل');
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
  goPage("db");   // المستخدم في صفحة تحديث القاعدة (يرفع ملفاته)
  const before = (document.querySelector(".page.active") || {}).id;
  // مدخل جاهز: مخزن ＋ بيانات زد (فرع stData في launchMatchIfReady)
  whRows = [{ "رقم الصنف": "X", "اسم الصنف": "صنف", "الكمية": 5, "سعر البيع شامل الضريبة": 100 }];
  stData = [["sku", "name_ar"], ["X", "صنف"]];
  invMeta = { id: 1, wh_count: 1 }; mergeWh = [{ code: "X", qty: 5, incl: 100 }]; mergeBranches = [];
  let ran = false; const orig = run; run = () => { ran = true; };   // تجسّس: هل أُعيدت المطابقة؟
  try { launchMatchIfReady(); } finally { run = orig; }
  return { before, after: (document.querySelector(".page.active") || {}).id, ran };
});
await b.close();
const fails = [];
if (res.before !== "page-db") fails.push(`الإعداد خاطئ: لم نبدأ في صفحة db (${res.before})`);
if (res.after !== "page-db") fails.push(`الصفحة انتقلت تلقائياً بعد الرفع: ${res.before} → ${res.after} (يجب أن تبقى db)`);
if (res.ran !== true) fails.push("المطابقة (run) لم تُعَد بعد الرفع — النتيجة لن تكون جاهزة");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-NAV مسك الانتقال التلقائي: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إعادة goPage(home) — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-NAV:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-NAV: بعد الرفع تبقى الصفحة كما هي (db) والمطابقة تُعاد في الخلفية (النتيجة جاهزة).");
