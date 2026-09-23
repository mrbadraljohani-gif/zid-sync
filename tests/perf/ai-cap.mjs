// ============================================================================
// G-AI-CAP — السقف مصدره واحد: القاعدة (meta.cap / ai_usage_status)، لا رقم ثابت في الواجهة (القيمة لا الشكل):
//   ① عند الفتح: سطر الرصيد يتبع cap من ai_usage_status (cap=500 ⇒ «… من 500»).
//   ② بعد جواب: يتبع meta.cap العائد (cap=500, remaining=496 ⇒ «496 من 500»). 🚫 لا «20» في أي منهما.
// --broken: يُثبّت السقف 20 في salesAIQuotaText ⇒ السطر يعرض «من 20» رغم cap=500 ⇒ يرسب.
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
  const A = 'function salesAIQuotaText(st) { return (!st || !Number.isFinite(st.cap)) ? `— سؤالاً اليوم` : `<b>${st.left}</b> من ${st.cap} سؤالاً اليوم`; }';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد salesAIQuotaText"); process.exit(2); }
  html = html.replace(A, 'function salesAIQuotaText(st) { return `<b>${st ? st.left : 0}</b> من 20 سؤالاً اليوم`; }   // (--broken) سقف ثابت');
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
  // cap=500 من القاعدة (status) ومن الرد (meta) — لا ثابت في الواجهة
  sb = { rpc: async () => ({ data: [{ used: 4, cap: 500 }], error: null }),
         functions: { invoke: async () => ({ data: { ok: true, structured: { lead: "مبيعات الخضرة 26,816 ر.س شامل.", metrics: [], warning: null, note: null, scope_label: "الخضرة", period_label: "كامل البيانات المتاحة" }, meta: { intent: "sales_summary", used: 4, remaining: 496, cap: 500 } }, error: null }) } };
  document.getElementById("page-sales").classList.add("active");
  await renderSalesAI();
  const onOpen = (document.getElementById("saiQuota") || {}).textContent || "";
  document.getElementById("saiInput").value = "كم بعنا في الخضرة؟";
  await salesAskAI();
  const afterAsk = (document.getElementById("saiQuota") || {}).textContent || "";
  const answer = (document.querySelector("#saiAnswer .sai-answer") || {}).textContent || "";
  return { onOpen, afterAsk, answer };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const has500 = s => /500/.test(s), has20 = s => /\b20\b/.test(s);
if (BROKEN) {
  if (has20(res.afterAsk) && !has500(res.afterAsk)) { console.log(`✅ (--broken) G-AI-CAP مسك العطل: السطر «${res.afterAsk.trim()}» ثابت 20 رغم cap=500.`); process.exit(0); }
  console.error(`✗ (--broken) لم يظهر السقف الثابت — لا أسنان («${res.afterAsk.trim()}»).`); process.exit(1);
}
if (!has500(res.onOpen)) fails.push(`سطر الفتح لا يتبع cap القاعدة (500): «${res.onOpen.trim()}»`);
if (!has500(res.afterAsk) || !/496/.test(res.afterAsk)) fails.push(`سطر ما بعد الجواب لا يتبع meta.cap (496 من 500): «${res.afterAsk.trim()}»`);
if (has20(res.onOpen) || has20(res.afterAsk)) fails.push(`ظهر السقف الثابت «20» — يجب أن يكون من المصدر الواحد`);
if (fails.length) { console.error("✗ G-AI-CAP:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-AI-CAP: الرصيد يتبع السقف من القاعدة — الفتح «${res.onOpen.trim()}» · بعد الجواب «${res.afterAsk.trim()}» (لا رقم ثابت).`);
