// ============================================================================
// G-AI-DISCLAIMER — «⚠ تحليل آليّ» مع الأجوبة التحليليّة فقط (القيمة، لا الشكل):
//   حاضر مع ذوات الأرقام/التحليل (analytical=true): مفرد بمقاييس · مركّب · تحليليّ بلا مقاييس (قوائم).
//   غائب مع أجوبة الخدمة (analytical=false): خارج التغطية · لا بيانات — «تحقّق من الأرقام» بلا أرقام نصّ بلا معنى.
//   الحارس القديم كان يفرضه على كل جواب فمرّ رغم ظهوره في الخدمة؛ هذا يفحص الحالتين.
// --broken: يجعل التصريح غير مشروط لكل ok ⇒ يظهر مع أجوبة الخدمة ⇒ يرسب.
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
  const A = "const disc = (data.structured && data.structured.analytical) ?";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد شرط التصريح"); process.exit(2); }
  html = html.replace(A, "const disc = (data.ok) ?");   // (--broken) غير مشروط — يظهر مع الخدمة
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
  const S = (o) => ({ metrics: [], warning: null, note: null, scope_label: "فرع العزيزية", period_label: "آخر 7 أيام", ...o });
  const shapes = {
    // تحليليّة (analytical:true) ⇒ التصريح حاضر
    single:    { ok: true, structured: S({ lead: "جواب مفرد.", metrics: [{ label: "المبيعات", value: "26,816", unit: "ر.س شامل" }], analytical: true }), meta },
    composite: { ok: true, structured: S({ lead: "ملخّص مركّب.", metrics: [{ label: "المبيعات", value: "36,588", unit: "ر.س شامل" }], analytical: true }), meta },
    linesOnly: { ok: true, structured: S({ lead: "أكثر منتج مبيعاً: مفرش.", metrics: [], analytical: true }), meta },   // تحليليّ بلا مقاييس (قوائم)
    // خدمة (analytical:false) ⇒ التصريح غائب
    unsupported: { ok: true, structured: S({ lead: "هذا السؤال خارج نطاقي حالياً.", analytical: false, scope_label: null, period_label: null }), meta },
    noData:      { ok: true, structured: S({ lead: "ما فيه بيانات كافية للإجابة.", analytical: false }), meta },
  };
  let cur = null;
  sb = { rpc: async () => ({ data: [{ used: 1, cap: 500 }], error: null }), functions: { invoke: async () => ({ data: cur, error: null }) } };
  document.getElementById("page-sales").classList.add("active");
  await renderSalesAI();
  const out = {};
  for (const k of Object.keys(shapes)) { cur = shapes[k]; document.getElementById("saiInput").value = "س " + k; await salesAskAI(); out[k] = !!document.querySelector("#saiAnswer .sai-disc"); }
  return out;
});
await b.close();
const analytical = ["single", "composite", "linesOnly"], service = ["unsupported", "noData"];
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (BROKEN) {
  if (service.some(k => res[k])) { console.log("✅ (--broken) G-AI-DISCLAIMER مسك العطل: التصريح ظهر مع جواب خدمة (غير مشروط)."); process.exit(0); }
  console.error("✗ (--broken) لم يظهر مع الخدمة — لا أسنان."); process.exit(1);
}
for (const k of analytical) if (!res[k]) fails.push(`التصريح غائب في جواب تحليليّ «${k}»`);
for (const k of service) if (res[k]) fails.push(`🚨 التصريح ظهر في جواب خدمة «${k}» (يجب أن يغيب — بلا أرقام)`);
if (fails.length) { console.error("✗ G-AI-DISCLAIMER:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-AI-DISCLAIMER: حاضر مع التحليليّ (مفرد/مركّب/قوائم) · غائب مع الخدمة (خارج التغطية/لا بيانات).");
