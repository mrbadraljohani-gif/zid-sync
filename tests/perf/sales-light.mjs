// ============================================================================
// G-LIGHT — الوضع الفاتح لشاشة عرض المبيعات وحدها (القيمة، لا الشكل):
//   ① كل توكن لوني له قيمة في الوضعين (داكن :root · فاتح #page-sales.sales-light) — لا توكن فارغ.
//   ② الأسطح/النصّ/اللمسات/اللكنات تتغيّر فعلاً في الفاتح (لا تبقى داكنة) — وأرض الشاشة تصير فاتحة #F5EFE3.
//   ③ 🚨 لا لمسة بيضاء عالقة: التوكنات الستّ (--tint..--shadow) في الفاتح ليست rgba(255,255,255|0,0,0) — لمسة داكنة خفيفة.
//   ④ اللكنات الفاتحة بالقيم المعتمدة (loc1=#0A6960 · gold=#8A5A10 …) فالرسوم SVG (var(--loc*)) تتبعها.
//   ⑤ 🚨 العزل: مع تفعيل الفاتح في المبيعات، تبقى #page-home (وكل شاشة بلا الصنف) داكنة حتماً (--bg = #070A12).
// --broken: تُحذف كتلة #page-sales.sales-light ⇒ التبديل يضيف الصنف بلا تجاوزات ⇒ الأرض/التوكنات تبقى داكنة ⇒ يرسب.
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
  const re = /#page-sales\.sales-light \{[\s\S]*?\n  \}/;   // كتلة الوضع الفاتح بأكملها
  if (!re.test(html)) { console.error("✗ (--broken) لم أجد كتلة #page-sales.sales-light"); process.exit(2); }
  html = html.replace(re, "#page-sales.sales-light { color: inherit; }");   // العطل: بلا تجاوزات توكنات
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { if (/^https?:/.test(r.url())) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const TOKENS = ["--bg","--steel","--text","--muted","--muted-2","--panel","--panel-2","--border","--border-strong","--hair",
  "--gold","--green","--danger","--cost","--info","--amber","--amber-tint","--loc-wh","--loc1","--loc2","--loc3","--loc4","--loc5","--loc6",
  "--tint","--tint-2","--tint-3","--tint-4","--scrim","--shadow"];
const TINTS = ["--tint","--tint-2","--tint-3","--tint-4","--scrim","--shadow"];

const res = await p.evaluate((TOKENS, TINTS) => {
  myRole = "marketing"; authSession = { user: { email: "m@x.sa" } };
  const ps = document.getElementById("page-sales"); ps.classList.add("active");
  const read = () => { const cs = getComputedStyle(ps); const o = {}; for (const t of TOKENS) o[t] = cs.getPropertyValue(t).trim(); return o; };
  salesTheme = "dark"; salesApplyTheme();
  const dark = read();
  const psBgDark = getComputedStyle(ps).backgroundColor;
  salesTheme = "light"; salesApplyTheme();
  const light = read();
  const psBgLight = getComputedStyle(ps).backgroundColor;
  // لكنة محسوبة فعلاً داخل الفاتح (الرسوم تستعملها عبر var)
  const probe = document.createElement("div"); ps.appendChild(probe);
  const colOf = tok => { probe.style.color = `var(${tok})`; return getComputedStyle(probe).color; };
  const loc1 = colOf("--loc1"), gold = colOf("--gold");
  // العزل: شاشة أخرى بلا الصنف
  const homeBg = getComputedStyle(document.getElementById("page-home")).getPropertyValue("--bg").trim();
  const hasClass = ps.classList.contains("sales-light");
  return { dark, light, psBgDark, psBgLight, loc1, gold, homeBg, hasClass };
}, TOKENS, TINTS);
await b.close();

const norm = s => s.replace(/\s+/g, "").toLowerCase();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
// ① كل توكن له قيمة في الوضعين
for (const t of TOKENS) { if (!res.dark[t]) fails.push(`① ${t} بلا قيمة في الداكن`); if (!res.light[t]) fails.push(`① ${t} بلا قيمة في الفاتح`); }
// ② أرض الشاشة فاتحة
if (norm(res.psBgLight) !== norm("rgb(245, 239, 227)")) fails.push(`② أرض الشاشة ليست #F5EFE3 في الفاتح: ${res.psBgLight}`);
// ② الأسطح/النصّ تغيّرت فعلاً
for (const t of ["--bg","--text","--panel","--border","--gold","--loc1","--loc6"])
  if (norm(res.dark[t]) === norm(res.light[t])) fails.push(`② ${t} لم يتغيّر بين الوضعين (${res.light[t]}) — بقعة داكنة`);
// ③ لا لمسة بيضاء/سوداء عالقة في الفاتح
for (const t of TINTS) if (/255,\s*255,\s*255|rgba?\(0,\s*0,\s*0/.test(res.light[t])) fails.push(`③ ${t} لمسة بيضاء/سوداء عالقة في الفاتح: ${res.light[t]}`);
// ④ اللكنات بالقيم المعتمدة
if (norm(res.loc1) !== norm("rgb(10, 105, 96)")) fails.push(`④ --loc1 الفاتح ليس #0A6960: ${res.loc1}`);
if (norm(res.gold) !== norm("rgb(138, 90, 16)")) fails.push(`④ --gold الفاتح ليس #8A5A10: ${res.gold}`);
// ⑤ العزل
if (res.homeBg.toUpperCase() !== "#070A12") fails.push(`⑤ 🚨 العزل انكسر: #page-home --bg = ${res.homeBg} (يجب #070A12 داكناً حتى مع فاتح المبيعات)`);

if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-LIGHT مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يُرصَد العطل — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-LIGHT:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-LIGHT: ${TOKENS.length} توكناً له قيمة في الوضعين · الأرض فاتحة #F5EFE3 · لا لمسة بيضاء عالقة · لكنات معتمدة (loc1/gold) · 🚨 العزل: #page-home داكنة (#070A12) مع فاتح المبيعات.`);
