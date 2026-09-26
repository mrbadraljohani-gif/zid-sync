// ============================================================================
// G-SALES-CHART — رسم «المبيعات المقدّرة عبر الزمن»: مفتاح تفاعليّ ＋ ألوان/أشكال متمايزة ＋ محاور مقروءة ＋ تلميح (القيمة، لا الشكل):
//   ① المفتاح يعرض كل موقع مرسوم: اسم ＋ عيّنة (svg) ＋ شكل مميّز · وسم «(من …)» للبداية المتأخّرة (الحراج).
//   ② ألوان متمايزة فعلاً: ألوان الخطوط المرسومة (rgb المحسوب) كلها مختلفة · 🚫 لا الذهبيّ (--gold) ولا التكلفة (--cost).
//   ③ أشكال مميّزة: لا اعتماد على اللون وحده — عناصر شكل غير الدائرة (polygon/rect) موجودة في الرسم والمفتاح.
//   ④ محور القيم بأرقام مستديرة (خطوات متساوية من نوع 1/2/5×10^n) — لا قيَم عشوائيّة (15.7K…).
//   ⑤ محور التواريخ: أكثر من طرفين (كلّها إن ≤7 وإلا واحدة من كلّ N ＋ الأخير).
//   ⑥ ضغطة «الخضرة» تُخفي خطّها (‏.sc-leg.off ＋ نقص عناصر الرسم) ثم تُعيده (استعادة).
//   ⑦ التلميح عند المرور يُظهر #salesChartTip (تاريخ ＋ إجمالي) داخل حدود البطاقة.
//   ⑧ بلا تجاوز أفقيّ @390.
// --broken:        salesLocColor يعيد لوناً واحداً للجميع ⇒ الألوان تتطابق ⇒ يرسب (②).
// --broken-shape:  salesLocShape يعيد "circle" للجميع ⇒ لا شكل مميّز ⇒ يرسب (③).
// --broken-toggle: salesToggleLine لا يفعل شيئاً ⇒ الضغطة لا تُخفي ⇒ يرسب (⑥).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MODE = process.argv.includes("--broken") ? "color" : process.argv.includes("--broken-shape") ? "shape" : process.argv.includes("--broken-toggle") ? "toggle" : "";
const BROKEN = !!MODE;
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (MODE === "color") {
  const A = 'return ["--loc1", "--loc2", "--loc3", "--loc4", "--loc5", "--loc6"][i] || "--loc6"; }';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد جدول ألوان المواقع"); process.exit(2); }
  html = html.replace(A, 'return "--loc1"; }');   // لون واحد للجميع (العطل)
} else if (MODE === "shape") {
  const A = 'return ["circle", "square", "triangle", "diamond", "star", "cross"][i] || "circle"; }';
  if (!html.includes(A)) { console.error("✗ (--broken-shape) لم أجد جدول أشكال المواقع"); process.exit(2); }
  html = html.replace(A, 'return "circle"; }');   // شكل واحد للجميع (العطل)
} else if (MODE === "toggle") {
  const A = "if (salesHiddenLines.has(loc)) salesHiddenLines.delete(loc); else salesHiddenLines.add(loc);";
  if (!html.includes(A)) { console.error("✗ (--broken-toggle) لم أجد جسم salesToggleLine"); process.exit(2); }
  html = html.replace(A, ";");   // التبديل لا يفعل شيئاً (العطل)
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 1000, isMobile: true });
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });

const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }]; salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = ""; salesHiddenLines = new Set();
  salesAllLocs = () => [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }, { id: "haraj_maf", name: "الحراج مفروشات" }, { id: "haraj_reh", name: "الحراج رحلات" }];
  const day = 86400000, iso = t => new Date(t).toISOString();
  const mk = (loc, dayAgo, v) => ({ kind: "estimated_sale", delta: -2, value_est: v, unit_price_incl: 50, unit_price_excl: 43, location: loc, sku: loc + dayAgo, sku_name: "x", upload_id: loc + dayAgo, captured_at: iso(Date.now() - dayAgo * day), period_days: 1 });
  const movs = []; for (let d = 8; d >= 1; d--) { movs.push(mk("az", d, 15700 - d * 400)); movs.push(mk("kh", d, 11800 - d * 300)); } for (let d = 4; d >= 1; d--) { movs.push(mk("haraj_reh", d, 7900 - d * 200)); }
  const stock = [{ location: "az", sku: "S", name: "x", qty: 5, price_incl: 50, price_excl: 43 }];
  db.sales = { uploads: async () => [...new Set(movs.map(m => m.upload_id))].map(id => { const m = movs.find(x => x.upload_id === id); return { id, location: m.location, captured_at: m.captured_at, suspect: false }; }), movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("sales"); } catch (e) {}   // يُفعّل #page-sales ويعطيه تخطيطاً حقيقيّاً (لازم لقياس التلميح)
  await renderSalesPage(); await new Promise(r => setTimeout(r, 60));

  const cs = getComputedStyle(document.documentElement);
  const goldRgb = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim();
  const num = s => { s = String(s).trim(); const m = s.match(/^([\d.]+)K$/); if (m) return Math.round(parseFloat(m[1]) * 1000); return /^[\d.]+$/.test(s) ? parseFloat(s) : NaN; };

  // ① المفتاح
  const legBtns = [...document.querySelectorAll("#salesChartLegend .sc-leg")];
  const legendNames = legBtns.map(b => (b.querySelector(".sc-leg-nm") || {}).textContent || "");
  const legHasSwatch = legBtns.every(b => b.querySelector("svg.sc-leg-sw"));
  const lateTag = [...document.querySelectorAll("#salesChartLegend .sc-leg-late")].map(e => e.textContent.trim());
  const noteInLegend = !!document.querySelector("#salesChartLegend .sc-leg-note");
  const aria0 = legBtns[0] ? legBtns[0].getAttribute("aria-pressed") : null;

  // ② ألوان الخطوط
  const polylines = [...document.querySelectorAll("#salesChart svg polyline")];
  const strokes = polylines.map(pl => getComputedStyle(pl).stroke);
  const distinctStrokes = new Set(strokes).size;
  const colTokens = ["az", "kh", "haraj_reh"].map(l => salesLocColor(l));
  const usesReserved = colTokens.some(t => t === "--gold" || t === "--cost");

  // ③ أشكال
  const shapeEls = document.querySelectorAll("#salesChart svg polygon, #salesChart svg rect").length;
  const legShapeEls = document.querySelectorAll("#salesChartLegend .sc-leg-sw polygon, #salesChartLegend .sc-leg-sw rect").length;
  const shapeTokens = new Set(["az", "kh", "haraj_reh"].map(l => salesLocShape(l))).size;

  // ④ محور القيم
  const yLabels = [...document.querySelectorAll("#salesChart .s4-ml-ax")].map(t => t.textContent.trim()).filter(t => /^(0|[\d.]+K?)$/.test(t));
  const yVals = yLabels.map(num).filter(Number.isFinite).sort((a, b) => a - b);
  const uniqY = [...new Set(yVals)];
  let evenSpaced = uniqY.length >= 3, niceStep = false;
  if (evenSpaced) {
    const diffs = uniqY.slice(1).map((v, i) => v - uniqY[i]);
    const st = diffs[0];
    evenSpaced = diffs.every(d => Math.abs(d - st) < 1e-6) && st > 0;
    if (evenSpaced) { const mag = Math.pow(10, Math.floor(Math.log10(st))), norm = st / mag; niceStep = [1, 2, 5, 10].some(n => Math.abs(norm - n) < 1e-6); }
  }

  // ⑤ محور التواريخ
  const xLabels = [...document.querySelectorAll("#salesChart .s4-ml-ax")].map(t => t.textContent).filter(t => /سبتمبر|أكتوبر|أغسطس|يوليو|يونيو|نوفمبر/.test(t));

  // ⑥ تبديل «الخضرة»
  const before = document.querySelectorAll("#salesChart svg polyline, #salesChart svg polygon, #salesChart svg circle, #salesChart svg rect").length;
  const khBtn = legBtns.find(bt => /الخضرة/.test(bt.textContent));
  khBtn && khBtn.click(); await new Promise(r => setTimeout(r, 20));
  const afterHide = document.querySelectorAll("#salesChart svg polyline, #salesChart svg polygon, #salesChart svg circle, #salesChart svg rect").length;
  const offPresent = !!document.querySelector("#salesChartLegend .sc-leg.off");
  const khBtn2 = [...document.querySelectorAll("#salesChartLegend .sc-leg")].find(bt => /الخضرة/.test(bt.textContent));
  khBtn2 && khBtn2.click(); await new Promise(r => setTimeout(r, 20));
  const afterShow = document.querySelectorAll("#salesChart svg polyline, #salesChart svg polygon, #salesChart svg circle, #salesChart svg rect").length;

  // ⑦ التلميح
  const svg = document.querySelector("#salesChart svg"), tip = document.getElementById("salesChartTip");
  let tipShown = false, tipInBounds = true;
  if (svg && tip) {
    const rect = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.5 }));
    await new Promise(r => setTimeout(r, 10));
    tipShown = tip.style.display === "block" && /الإجمالي/.test(tip.textContent);
    const host = document.getElementById("salesChart"), tr = tip.getBoundingClientRect(), hr = host.getBoundingClientRect();
    tipInBounds = tr.right <= hr.right + 1 && tr.left >= hr.left - 1;
  }

  const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  return { legendNames, legHasSwatch, lateTag, noteInLegend, aria0, strokesLen: strokes.length, distinctStrokes, usesReserved, colTokens, shapeEls, legShapeEls, shapeTokens, yLabels, yVals: uniqY, evenSpaced, niceStep, xCount: xLabels.length, before, afterHide, afterShow, offPresent, tipShown, tipInBounds, overflow };
});
await b.close();

if (BROKEN) {
  const caught =
    (MODE === "color" && (res.distinctStrokes < res.strokesLen || res.usesReserved)) ||
    (MODE === "shape" && (res.shapeEls === 0 || res.shapeTokens < 2)) ||
    (MODE === "toggle" && res.afterHide === res.before);
  const flag = MODE === "color" ? "--broken" : "--broken-" + MODE;
  if (caught) { console.log(`✅ (${flag}) G-SALES-CHART مسك العطل.`); process.exit(0); }
  console.error(`✗ (${flag}) لم يُرصَد العطل — لا أسنان. ${JSON.stringify(res)}`); process.exit(1);
}
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (res.legendNames.length < 3 || res.legendNames.some(n => !n)) fails.push(`① المفتاح لا يعرض كل موقع باسمه: ${JSON.stringify(res.legendNames)}`);
if (!res.legHasSwatch) fails.push("① بعض أزرار المفتاح بلا عيّنة svg");
if (res.aria0 !== "true") fails.push(`① aria-pressed غير مضبوط (=${res.aria0})`);
if (!res.lateTag.some(t => /^\(من /.test(t))) fails.push(`③ وسم البداية المتأخّرة «(من …)» غائب: ${JSON.stringify(res.lateTag)}`);
if (!res.noteInLegend) fails.push("⑦ شرح النقطة المجوّفة غائب عن المفتاح");
if (res.distinctStrokes < res.strokesLen) fails.push(`② ألوان الخطوط متطابقة (${res.distinctStrokes}/${res.strokesLen} مميّز)`);
if (res.usesReserved) fails.push(`② لون محجوز مستعمل (ذهبيّ/تكلفة): ${JSON.stringify(res.colTokens)}`);
if (res.shapeEls === 0) fails.push("③ لا عناصر شكل (polygon/rect) في الرسم — اعتماد على اللون وحده");
if (res.legShapeEls === 0) fails.push("③ لا عناصر شكل في عيّنات المفتاح");
if (res.shapeTokens < 2) fails.push(`③ أشكال المواقع غير متمايزة (${res.shapeTokens} نوع)`);
if (!res.evenSpaced) fails.push(`④ محور القيم غير متساوي الخطوات: ${JSON.stringify(res.yVals)}`);
if (!res.niceStep) fails.push(`④ خطوة المحور ليست مستديرة (1/2/5×10^n): ${JSON.stringify(res.yVals)}`);
if (res.xCount < 3) fails.push(`⑤ تسميات التواريخ ≤2 (طرفان فقط): ${res.xCount}`);
if (res.afterHide >= res.before) fails.push(`⑥ ضغطة «الخضرة» لم تُخفِ خطّها (${res.before}→${res.afterHide})`);
if (!res.offPresent) fails.push("⑥ لا صنف .sc-leg.off بعد الإخفاء");
if (res.afterShow !== res.before) fails.push(`⑥ إعادة الضغط لم تُعِد الخطّ (${res.before}→${res.afterShow})`);
if (!res.tipShown) fails.push("⑦ التلميح لا يظهر عند المرور");
if (!res.tipInBounds) fails.push("⑦ التلميح يتجاوز حدود البطاقة");
if (res.overflow) fails.push("⑧ تجاوز أفقيّ @390");
if (fails.length) { console.error("✗ G-SALES-CHART:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-SALES-CHART: المفتاح (${res.legendNames.length} موقع بأسماء/عيّنات/أشكال · وسم «${res.lateTag.join("،")}») · ألوان مميّزة (${res.distinctStrokes}/${res.strokesLen}، بلا محجوز) · أشكال (${res.shapeEls} عنصر، ${res.shapeTokens} نوع) · محور مستدير (${res.yVals.join("·")}) · ${res.xCount} تسمية تاريخ · تبديل الخضرة (${res.before}→${res.afterHide}→${res.afterShow}) · تلميح داخل الحدود · بلا تجاوز @390.`);
