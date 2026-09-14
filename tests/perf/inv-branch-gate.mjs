// ============================================================================
// G-GATE (دفعة ١ب) — بوّابة الانكماش تُقارِن الفرع بمرجع **الفرع المختار نفسه**
//   (item_count من invBranches) لا بالإجمالي (invMeta.branch_count). وإلا فرفعُ فرعٍ
//   صغيرٍ يُقارَن بمجموع كل الفروع فيُنذر كاذباً ويُلغي رفعاً سليماً.
// يتحقّق: فرعان A=1000 · B=50 (الإجمالي 1050). رفع B بـ45 كوداً (−10% عن B):
//   per-branch ⇒ يمرّ (تحت 15%) · بالإجمالي ⇒ −95.7% ⇒ إنذار كاذب.
//   ＋ انكماش B الحقيقي (50→40 = −20%) ⇒ يوقف · فرع جديد (item_count=0) ⇒ لا بوّابة.
// --broken: يعيد الأساس إلى invMeta.branch_count ⇒ رفع B الصغير يُنذر كاذباً ⇒ يرسب.
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
  // أعِد الأساس الخاطئ (الإجمالي) للفرع: كأنّ ١ب لم يُطبَّق
  const FIX = 'else { const br = (invBranches || []).find(b => b.id === branchId); prev = br && br.item_count; label = "الفرع" + (br && br.name ? ` «${br.name}»` : ""); }';
  if (!html.includes(FIX)) { console.error("✗ (--broken) لم أجد سطر الأساس per-branch لعكسه"); process.exit(2); }
  html = html.replace(FIX, 'else { prev = invMeta && invMeta.branch_count; label = "الفرع"; }');
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(() => {
  const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
  const calls = [];
  window.confirm = m => { calls.push(m); return false; };   // المستخدم يلغي عند أي حوار
  invBranches = [{ id: "A", name: "العزيزية", item_count: 1000 }, { id: "B", name: "الخضرة", item_count: 50 }];
  invMeta = { id: 1, wh_count: 1200, branch_count: 1050 };   // الإجمالي 1050 (الأساس الخاطئ)
  const out = { calls };
  out.smallOk = invShrinkCheck("branch", 45, "B");    // 45 مقابل B=50 (−10%) ⇒ يجب يمرّ per-branch
  out.realShrink = invShrinkCheck("branch", 40, "B"); // 40 مقابل B=50 (−20%) ⇒ يجب يوقف
  out.newBranch = invShrinkCheck("branch", 30, "NEW");// فرع بلا مرجع (غير موجود) ⇒ لا بوّابة
  out.wh = invShrinkCheck("wh", 1000);                // المستودع 1000 مقابل 1200 (−16.7%) ⇒ يوقف (لم يتغيّر)
  return out;
});
await b.close();
const fails = [];
if (res.smallOk !== true) fails.push("① رفع فرع صغير (45 مقابل B=50، −10%) أُنذر كاذباً — البوّابة تقارن بالإجمالي لا بالفرع");
if (res.realShrink !== false) fails.push("② انكماش B الحقيقي (50→40، −20%) لم يوقف");
if (res.newBranch !== true) fails.push("③ فرع بلا مرجع (item_count غائب) يجب أن يمرّ بلا بوّابة");
if (res.wh !== false) fails.push("④ المستودع (−16.7%) لم يوقف — تأثّر مرجعه");
// الحوار الوحيد المتوقّع: انكماش B الحقيقي (②) والمستودع (④) — لا حوار على الصغير السليم (①)
const brDialogs = res.calls.filter(m => /الخضرة/.test(m));
if (res.smallOk === true && brDialogs.some(m => /45/.test(m))) fails.push("① ظهر حوار على الرفع الصغير السليم (لا يجب)");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-GATE مسك الإنذار الكاذب: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إعادة الأساس الإجماليّ — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-GATE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-GATE: البوّابة تقارن الفرع بمرجعه (الصغير السليم يمرّ · الانكماش الحقيقي يوقف · الجديد بلا بوّابة · المستودع كما هو).");
