// ============================================================================
// G-SALES-COV — بوّابة «التاريخ غير كافٍ» على مؤشّرات المعدّل اليوميّ (القيمة، لا الشكل):
//   المؤشّرات المشتقّة من معدّل يوميّ (متوسط أيام التغطية · مخاطر النفاد) لا تُوثَق قبل ١٤ يوم رصد.
//   ① رصد قصير (2 يوم) ⇒ KPI «متوسط أيام التغطية» = «—» ＋ شرح «يلزم 14 يوماً (المرصود: N يوم)».
//   ② رصد كافٍ (20 يوم) ⇒ KPI يعرض رقماً (يوم).
// --broken: يجعل salesCovInsufficient تُرجع false دائماً ⇒ الرصد القصير يعرض رقماً واثقاً ⇒ يرسب.
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
  const A = "function salesCovInsufficient(days) { return (Number(days) || 0) < S4_STAGNANT_MIN_DAYS; }";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد دالّة بوّابة التغطية"); process.exit(2); }
  html = html.replace(A, "function salesCovInsufficient(days) { return false; }");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
async function run(days) {
  return await p.evaluate(async (days) => {
    dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
    invBranches = [{ id: "br", name: "فرع" }]; salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = "";
    const now = new Date().toISOString();
    const movs = [{ kind: "estimated_sale", delta: -10, value_est: 1000, unit_price_incl: 100, location: "br", sku: "A1", sku_name: "صنف", upload_id: "U", captured_at: now, period_days: days }];
    const stock = [{ location: "br", sku: "A1", name: "صنف", qty: 100, price_incl: 100 }];
    db.sales = { uploads: async () => [{ id: "U", location: "br", captured_at: now, suspect: false }], movements: async () => movs, clearSuspect: async () => {} };
    sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
    try { goPage("home"); } catch (e) {}
    const r = document.getElementById("result"); if (r) r.style.display = "block";
    document.getElementById("page-sales").classList.add("active");
    await renderSalesPage();
    const txt = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
    const scov = document.querySelector('#salesKpis .kpi[data-k="scov"]');
    const scovVal = txt(scov && scov.querySelector("b"));
    const scovSub = txt(scov && scov.querySelector(".kpi-sub"));
    // التغطية في شريط تفصيل التبويب
    const covCardVal = txt(document.querySelector('#salesDetail .s4-dstrip [data-k="scov"] b'));
    return { scovVal, scovSub, covCardVal };
  }, days);
}
const short = await run(2);      // رصد قصير
const enough = await run(20);    // رصد كافٍ
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  if (short.scovVal.replace(/[^\d]/g, "") !== "") fails.push(`رصد قصير: KPI التغطية عرض رقماً (${short.scovVal}) بدل «—»`);
  if (!/يلزم\s*14/.test(short.scovSub) || !/المرصود/.test(short.scovSub)) fails.push(`رصد قصير: شرح التغطية بلا «يلزم 14 … المرصود»: «${short.scovSub}»`);
  if (short.covCardVal.replace(/[^\d]/g, "") !== "") fails.push(`رصد قصير: بطاقة تفصيل التغطية عرضت رقماً (${short.covCardVal})`);
  if (!/يوم/.test(enough.scovVal) || enough.scovVal.replace(/[^\d]/g, "") === "") fails.push(`رصد كافٍ: KPI التغطية لم يعرض رقماً: «${enough.scovVal}»`);
}
if (BROKEN) {
  // مع إلغاء البوّابة: الرصد القصير يعرض رقماً ⇒ رسوب متوقّع في الوضع السليم
  if (short.scovVal.replace(/[^\d]/g, "") !== "") { console.log("✅ (--broken) G-SALES-COV مسك العطل: الرصد القصير عرض رقم تغطية واثق بلا بوّابة"); process.exit(0); }
  console.error("✗ (--broken) لم يعرض رقماً بعد إلغاء البوّابة — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-SALES-COV:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SALES-COV: التغطية مبوّبة «يلزم 14 (المرصود N)» عند رصد <14 يوم · تعرض رقماً عند الكفاية · تفصيل التبويب كذلك.");
