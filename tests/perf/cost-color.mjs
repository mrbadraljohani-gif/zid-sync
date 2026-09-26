// ============================================================================
// G-COST-COLOR — سعر التكلفة أحمر موحّد بتوكن مستقلّ --cost (القيمة، لا الشكل):
//   ① --cost موجود وأحمر ومنفصل عن --danger (لونان مختلفان — الخطأ يبقى خطأً).
//   ② المواضع الثلاثة تستعمل var(--cost): شارة .q-chip.cost · عمود .s4-tbl td.cost-c · رقم .kpi[data-k="sinv"]>b.
//   ③ لون شارة التكلفة المرسومة == --cost (لا --muted القديم ولا --danger).
//   ④ 🚫 خلفية الشارة تبقى سطحاً خفيفاً لا حمراء صريحة (خلفية ≠ --cost).
//   ⑤ رسالة خطأ حقيقية (.q-warn ← --danger/--gold) لا تساوي --cost (لا تشبه شارة التكلفة).
// --broken: .q-chip.cost يستعمل var(--danger) ⇒ التكلفة == الخطأ ⇒ يرسب.
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
  const A = ".q-chip.cost { color: var(--cost);";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد قاعدة لون شارة التكلفة"); process.exit(2); }
  html = html.replace(A, ".q-chip.cost { color: var(--danger);");   // يعيد استعمال توكن الخطأ
}
// فحص ساكن: المواضع الثلاثة تستعمل var(--cost)
const staticFails = [];
for (const rule of [".q-chip.cost { color: var(--cost)", ".s4-tbl td.cost-c { color: var(--cost)", '.kpi[data-k="sinv"] > b { color: var(--cost)'])
  if (!BROKEN && !html.includes(rule)) staticFails.push("قاعدة مفقودة: " + rule);
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { if (/^https?:/.test(r.url())) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const tok = n => cs.getPropertyValue(n).trim();
  // ارسم شارة التكلفة فعلاً واقرأ لونها المحسوب
  myRole = "owner"; invBranches = [{ id: "az", name: "العزيزية" }]; salesAllLocs = () => [{ id: "az", name: "العزيزية" }];
  salesCtx = { stock: [{ location: "wh", sku: "240015", name: "صنف", qty: 5, price_incl: 60, price_excl: 52, cost_price: 38 }] };
  const host = document.createElement("div"); host.innerHTML = sqBadgeRow("240015"); document.body.appendChild(host);
  const costChip = host.querySelector(".q-chip.cost"), priceChip = host.querySelector(".q-chip.price");
  const costColor = costChip ? getComputedStyle(costChip).color : "";
  const costBg = costChip ? getComputedStyle(costChip).backgroundColor : "";
  const priceColor = priceChip ? getComputedStyle(priceChip).color : "";
  // لون محسوب لعنصر يستعمل --cost مقابل عنصر يستعمل --danger
  const mk = (varname) => { const e = document.createElement("span"); e.style.color = "var(" + varname + ")"; document.body.appendChild(e); return getComputedStyle(e).color; };
  return { cost: tok("--cost"), danger: tok("--danger"), gold: tok("--gold"), muted: tok("--muted"),
           costColor, costBg, priceColor, costResolved: mk("--cost"), dangerResolved: mk("--danger") };
});
await b.close();

if (BROKEN) {
  if (res.costColor === res.dangerResolved) { console.log("✅ (--broken) G-COST-COLOR مسك العطل: شارة التكلفة لوّنت بتوكن الخطأ --danger."); process.exit(0); }
  console.error("✗ (--broken) لون التكلفة لم يساوِ --danger — لا أسنان. " + JSON.stringify(res)); process.exit(1);
}
const fails = [...staticFails];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!res.cost) fails.push("① توكن --cost غير معرّف");
if (res.cost.toLowerCase() === res.danger.toLowerCase()) fails.push(`① --cost يساوي --danger (${res.cost}) — يجب لونين منفصلين`);
if (res.costColor !== res.costResolved) fails.push(`③ لون شارة التكلفة (${res.costColor}) ليس --cost (${res.costResolved})`);
if (res.costColor === res.dangerResolved) fails.push("③ لون شارة التكلفة == --danger (خلط الخطأ بالتكلفة)");
if (res.costColor === res.priceColor) fails.push("③ لون التكلفة == لون السعر الذهبيّ (يجب تمييزهما)");
// ④ الخلفية ليست --cost (سطح خفيف لا أحمر صريح)
if (res.costBg === res.costResolved) fails.push("④ خلفية شارة التكلفة حمراء صريحة (--cost) — يجب سطحاً خفيفاً");
// ⑤ رسالة الخطأ (--danger) ≠ --cost
if (res.dangerResolved === res.costResolved) fails.push("⑤ لون الخطأ == لون التكلفة (لا تمييز)");
if (fails.length) { console.error("✗ G-COST-COLOR:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-COST-COLOR: --cost (${res.cost}) أحمر مستقلّ عن --danger (${res.danger}) · المواضع الثلاثة تستعمله · الشارة نصّها --cost وخلفيتها سطح خفيف · الخطأ يبقى بلونه.`);
