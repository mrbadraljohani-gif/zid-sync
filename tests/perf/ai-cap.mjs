// ============================================================================
// G-AI-CAP — السقف يبقى في الخلفية ولا يُعرَض للمستخدم (القيمة، لا الشكل):
//   الخلفية تُرجع meta.cap/remaining وتفرض الحدّ — 🚫 لكن الواجهة لا تعرض أي رقم رصيد/سقف إطلاقاً
//   (لا «N من 500»، لا رقم متبقٍّ). لا أحد يسأل 500 سؤالاً، وإظهاره يوحي بقيد لا وجود له عملياً.
// --broken: يُسرّب meta.cap إلى بطاقة المساعد ⇒ يظهر «500» ⇒ يرسب.
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
  const A = "if (ansEl) ansEl.innerHTML = bodyHtml + disc;";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد سطر عرض الجواب"); process.exit(2); }
  html = html.replace(A, 'if (ansEl) ansEl.innerHTML = bodyHtml + disc + (data.meta ? `<span class="leak">${data.meta.cap}</span>` : "");   // (--broken) تسريب السقف');
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
  // الخلفية تُرجع cap=500/remaining=496 (تفرضه) — الجواب نفسه بلا 500/496
  sb = { rpc: async () => ({ data: [{ used: 4, cap: 500 }], error: null }),
         functions: { invoke: async () => ({ data: { ok: true, structured: { lead: "مبيعات العزيزية ممتازة اليوم.", metrics: [{ label: "المبيعات", value: "1,234", unit: "ر.س شامل" }], warning: null, note: "المبيعات مقدّرة.", scope_label: "فرع العزيزية", period_label: "آخر 7 أيام", analytical: true }, meta: { used: 4, remaining: 496, cap: 500 } }, error: null }) } };
  document.getElementById("page-sales").classList.add("active");
  await renderSalesAI();
  const cardOpen = (document.querySelector("#salesAI .sai-card") || {}).textContent || "";
  document.getElementById("saiInput").value = "كم بعنا؟";
  await salesAskAI();
  const cardAfter = (document.querySelector("#salesAI .sai-card") || {}).textContent || "";
  return { cardOpen, cardAfter };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const shows = s => /\b500\b/.test(s) || /\b496\b/.test(s) || /سؤالاً اليوم/.test(s) || /من 500/.test(s);
if (BROKEN) {
  if (shows(res.cardAfter)) { console.log("✅ (--broken) G-AI-CAP مسك التسريب: ظهر رقم السقف/الرصيد في البطاقة."); process.exit(0); }
  console.error("✗ (--broken) لم يظهر رقم — لا أسنان (« " + res.cardAfter.trim().slice(0, 60) + " »)."); process.exit(1);
}
if (shows(res.cardOpen)) fails.push(`عند الفتح: ظهر رقم رصيد/سقف في البطاقة: «${res.cardOpen.trim().slice(0, 80)}»`);
if (shows(res.cardAfter)) fails.push(`بعد الجواب: ظهر رقم رصيد/سقف في البطاقة: «${res.cardAfter.trim().slice(0, 80)}»`);
if (fails.length) { console.error("✗ G-AI-CAP:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-AI-CAP: لا رقم رصيد/سقف في الواجهة (فتحاً وبعد جواب) — السقف يبقى في الخلفية (meta.cap/ai_usage_bump).");
