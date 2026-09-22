// ============================================================================
// G-COUNT — «رقم واحد لمفهوم واحد»: كل قرّاء «يحتاج ربط» يقرأون batchOkItem نفسه.
//   على تجهيزة (2 يحتاج + 1 غير متوفر + 1 أب يتيم) يجب أن تكون كلها = 2:
//     KPI (#kpiUnmatched) == «يحتاج انتباهك» (#invAttention) == عنوان القائمة (uni-head)
//     == شريحة «يحتاج ربط» == لافتة #newAlert.
// أُثبِت رسوبه على الكود قبل التوحيد: KPI/الانتباه=4 (الطول الخام) واللافتة=3 (تستبعد الانتظار وحده).
// --broken: يعيد KPI إلى lastUnmatchedRaw.length ⇒ 4 ≠ 2 ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  const A = 'setK("kpiUnmatched", lastUnmatchedRaw.filter(batchOkItem).length';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد سطر KPI الموحَّد"); process.exit(2); }
  html = html.replace(A, 'setK("kpiUnmatched", lastUnmatchedRaw.length');
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
const server = createServer((req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("http://127.0.0.1:" + port)) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
const res = await p.evaluate(() => {
  // تجهيزة موحّدة: 2 يحتاج ربط + 1 «غير متوفر» + 1 أب يتيم ⇒ batchOkItem = 2
  famIndex = null; manualMap = {}; boundSet = new Set(); lastWhList = []; lastAbsent = [];
  lastCollisions = []; lastVariantGroups = []; lastMatchedWhCodes = new Set(); batchAliases = new Set();
  lastRunSummary = {}; lastClassify = null; batchData = null; btMode = "all";
  lastUnmatchedRaw = [
    { sku: "N1", skuN: "N1", qty: 5, name: "يحتاج1", price: 10, img: "" },
    { sku: "N2", skuN: "N2", qty: 5, name: "يحتاج2", price: 10, img: "" },
    { sku: "WT", skuN: "WT", qty: 0, name: "غير متوفر", price: 10, img: "" },
    { sku: "P1", skuN: "P1", qty: 5, name: "أب يتيم", price: 10, img: "", orphanParent: true },
  ];
  waitingSet = new Set([normCode("WT")]);
  currentFilter = "unmatched"; activeCard = "unmatched";
  // ارسم كل القرّاء
  renderInvKPIs();
  renderInventoryAttention();
  updateNewCount();
  renderDetail(); if (typeof flushUnified === "function") flushUnified();
  const txt = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const digits = s => { const m = String(s).match(/\d+/); return m ? +m[0] : null; };
  const kpi = digits(txt(document.getElementById("kpiUnmatched")));
  const attCard = [...document.querySelectorAll("#invAttention .stc")].find(c => (c.textContent || "").includes("يحتاج ربط"));
  const att = attCard ? digits(txt(attCard.querySelector(".stc-num")) || txt(attCard.querySelector(".stc-badge"))) : null;
  const bnEl = document.querySelector("#newAlert bdi");   // من الـbdi لا من innerHTML (أيقونة SVG تحمل أرقاماً)
  const banner = bnEl ? digits(bnEl.textContent) : ((document.getElementById("newAlert") || {}).style || {}).display === "none" ? 0 : null;
  const head = digits(txt(document.querySelector("#detailTable .uni-head bdi")));
  const needChipEl = [...document.querySelectorAll("#detailTable .uni-chip.need bdi")][0];
  const chip = needChipEl ? digits(needChipEl.textContent) : null;
  return { kpi, att, banner, head, chip };
});
await b.close(); server.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const want = 2;
const named = { "KPI (#kpiUnmatched)": res.kpi, "«يحتاج انتباهك»": res.att, "عنوان القائمة": res.head, "شريحة «يحتاج ربط»": res.chip, "لافتة #newAlert": res.banner };
for (const [k, v] of Object.entries(named)) if (v !== want) fails.push(`${k} = ${v} (توقّعت ${want} = batchOkItem)`);
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-COUNT مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إعادة KPI للطول الخام — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-COUNT (رقم واحد لمفهوم واحد):\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-COUNT: كل قرّاء «يحتاج ربط» = 2 (batchOkItem): KPI == يحتاج انتباهك == عنوان القائمة == الشريحة == اللافتة.");
