// ============================================================================
// G-AI-DISCLAIMER — «⚠ تحليل آليّ» تحت كل جواب ناجح بلا استثناء (القيمة، لا الشكل):
//   يُختبَر على 4 أشكال: نيّة مفردة (بمقاييس) · مركّبة · بلا مقاييس · مع warning — التصريح موجود في الأربعة.
//   الحارس القديم مرّ أخضر لأنه فحص حالة واحدة؛ هذا يغطّي الأشكال التي غاب فيها.
// --broken: يقرن التصريح بوجود المقاييس ⇒ شكل «بلا مقاييس» يفقده ⇒ يرسب.
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
  const A = "    if (data && data.ok) {";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد شرط عرض الجواب"); process.exit(2); }
  html = html.replace(A, "    if (data && data.ok && data.structured && data.structured.metrics && data.structured.metrics.length) {   // (--broken) قرن التصريح بالمقاييس");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }];
  const meta = { used: 1, remaining: 499, cap: 500 };
  const shapes = {
    single:   { ok: true, structured: { lead: "جواب مفرد.", metrics: [{ label: "المبيعات المقدّرة", value: "26,816", unit: "ر.س شامل" }], warning: null, note: "المبيعات مقدّرة." }, meta },
    composite:{ ok: true, structured: { lead: "ملخّص مركّب.", metrics: [{ label: "المبيعات", value: "36,588", unit: "ر.س شامل" }, { label: "قطع", value: "935", unit: "قطعة" }], warning: null, note: null }, meta },
    nometrics:{ ok: true, structured: { lead: "لا بيانات كافية للإجابة.", metrics: [], warning: null, note: null }, meta },
    warn:     { ok: true, structured: { lead: "جواب بتحذير.", metrics: [{ label: "أيام الرصد", value: "2.7", unit: "يوم" }], warning: "التاريخ غير كافٍ.", note: null }, meta },
  };
  let cur = null;
  sb = { rpc: async () => ({ data: [{ used: 1, cap: 500 }], error: null }), functions: { invoke: async () => ({ data: cur, error: null }) } };
  document.getElementById("page-sales").classList.add("active");
  await renderSalesAI();
  const out = {};
  for (const k of Object.keys(shapes)) {
    cur = shapes[k];
    document.getElementById("saiInput").value = "س " + k;
    await salesAskAI();
    out[k] = !!document.querySelector("#saiAnswer .sai-disc");
  }
  return out;
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (BROKEN) {
  if (!res.nometrics) { console.log("✅ (--broken) G-AI-DISCLAIMER مسك العطل: شكل «بلا مقاييس» فقد التصريح (قُرن بالمقاييس)."); process.exit(0); }
  console.error("✗ (--broken) التصريح ظهر رغم القرن — لا أسنان."); process.exit(1);
}
for (const k of ["single", "composite", "nometrics", "warn"]) if (!res[k]) fails.push(`التصريح غائب في شكل «${k}»`);
if (fails.length) { console.error("✗ G-AI-DISCLAIMER:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-AI-DISCLAIMER: «تحليل آليّ» حاضر في الأشكال الأربعة (مفرد · مركّب · بلا مقاييس · مع تحذير).");
