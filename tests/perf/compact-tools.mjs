// ============================================================================
// G-COMPACT-TOOLS — شريط الأدوات المُدمج (المساعد ＋ البحث) بدل بطاقتين ضخمتين (القيمة، لا الشكل):
//   ① الترتيب: الفلاتر (.s4-top) ← الأدوات المُدمجة (#salesTools) ← المؤشّرات (#salesKpis).
//   ② الشكل الافتراضيّ مُدمج: اللوحة والمنسدلة مطويّتان (hidden) — 🚫 لا بطاقة ضخمة ظاهرة.
//   ③ ارتفاع الشريط 50–60px (قياس فعليّ).
//   ④ أهداف اللمس ≥32px بعد فتح اللوحة (زرّ · حقل · أمثلة · اسأل).
//   ⑤ اقتطاع المنسدلة (الفخّ الكلاسيكيّ): آخر نتيجة في قائمة طويلة مرئية فوق المؤشّرات
//      (elementFromPoint يعيدها، لا بطاقة مؤشّر) — قياساً لا بالعين، على 1200 و360.
//   ⑥ بلا تمرير أفقيّ عند 360px (مغلقاً ومع منسدلة مفتوحة).
//   ⑦ فتح اللوحة لا يُزيح المؤشّرات (عائمة) — top(#salesKpis) ثابت قبل الفتح وبعده.
//
// الأسنان:
//   --broken            : اللوحة والمنسدلة تظهران افتراضياً (= التخطيط القديم: بطاقتان ظاهرتان) ⇒ يرسب على ②.
//   --broken-clip       : سلف (.s4-tools) بـoverflow:hidden يقتطع المنسدلة ⇒ آخر نتيجة محجوبة ⇒ يرسب على ⑤.
//   --broken-collapsed  : الحارس لا يفتح اللوحة قبل قياس اللمس ⇒ أبعاد صفرية ⇒ يرسب على ④ (يُثبت أنّ الحارس يفتح فعلاً).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const CLIP = process.argv.includes("--broken-clip");
const COLLAPSED = process.argv.includes("--broken-collapsed");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  // التخطيط القديم: اللوحة والمنسدلة ظاهرتان افتراضياً (لا hidden)
  const A = 'id="saiPanel" role="region" aria-label="مساعد المبيعات" hidden';
  const B = 'id="sqResults" class="sq-drop" role="listbox" aria-label="نتائج البحث" hidden';
  if (!html.includes(A) || !html.includes(B)) { console.error("✗ (--broken) لم أجد hidden الافتراضيّ للّوحة/المنسدلة"); process.exit(2); }
  html = html.replace(A, 'id="saiPanel" role="region" aria-label="مساعد المبيعات"').replace(B, 'id="sqResults" class="sq-drop" role="listbox" aria-label="نتائج البحث"');
}
if (CLIP) {
  // سلف يقتطع: .s4-tools بـoverflow:hidden وارتفاع محدود ⇒ المنسدلة العائمة تُقصّ
  html = html.replace(".s4-tools { position: relative;", ".s4-tools { overflow: hidden; max-height: 60px; position: relative;");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });

async function runAt(width) {
  const p = await b.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  await p.setViewport({ width, height: 900, isMobile: width < 700, deviceScaleFactor: 1 });
  await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
  await p.setContent(html, { waitUntil: "load" });
  const res = await p.evaluate(async (COLLAPSED) => {
    dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
    invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
    salesPeriod = "all"; salesLoc = "all"; salesTab = "all";
    const now = new Date().toISOString();
    // 40 صنفاً باسم مشترك ⇒ قائمة طويلة تختبر الاقتطاع/آخر نتيجة
    const stock = []; for (let i = 0; i < 40; i++) stock.push({ location: "kh", sku: "K" + i, name: "كرسي رقم " + i, qty: 5 + i, price_incl: 100, price_excl: 87, barcode: "b" + i });
    const movs = [{ kind: "estimated_sale", delta: -5, value_est: 500, unit_price_incl: 100, unit_price_excl: 87, location: "kh", sku: "K0", sku_name: "كرسي رقم 0", upload_id: "U_kh", captured_at: now, period_days: 5 }];
    const ups = [{ id: "U_kh", location: "kh", captured_at: now, suspect: false }];
    db.sales = { uploads: async () => ups, movements: async () => movs, clearSuspect: async () => {} };
    sb = { rpc: async () => ({ data: [{ used: 0, cap: 500 }], error: null }), from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
    try { goPage("home"); } catch (e) {}
    document.getElementById("page-sales").classList.add("active");
    await renderSalesPage();
    const R = (el) => el ? el.getBoundingClientRect() : null;
    // إحداثيّ الوثيقة المطلق (مستقلّ عن التمرير) — فلا يخلط تمرير focus() بإزاحة التخطيط
    const topOf = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().top + window.scrollY : null; };
    // ① الترتيب
    const tFilters = topOf(".s4-top"), tTools = topOf("#salesTools"), tKpis = topOf("#salesKpis");
    const orderOK = tFilters != null && tTools != null && tKpis != null && tFilters <= tTools + 0.5 && tTools <= tKpis + 0.5;
    // ② الشكل الافتراضيّ مُدمج
    const panel = document.getElementById("saiPanel"), drop = document.getElementById("sqResults");
    const defaultCompact = !!(panel && panel.hidden) && !!(drop && drop.hidden);
    // ③ ارتفاع الشريط
    const barH = Math.round((R(document.querySelector("#salesSearchTool .stool")) || { height: 0 }).height);
    // ⑦ موضع المؤشّرات قبل فتح المساعد
    const kpiTopBefore = tKpis;
    // ④ فتح المساعد (إلا في --broken-collapsed) وقياس اللمس
    if (!COLLAPSED) salesAIToggle();
    const h = (sel) => Math.round((R(document.querySelector(sel)) || { height: 0 }).height);
    const touch = { toggle: h("#saiToggle"), input: h("#saiInput"), ask: h("#saiAsk"), chip: h(".sai-chip") };
    const panelVisible = !!(panel && panel.getBoundingClientRect().height > 0);
    const kpiTopAfterAI = topOf("#salesKpis");
    salesAIToggle();   // إغلاق المساعد
    // ⑤ منسدلة طويلة: بحث «كرسي» ⇒ 40 نتيجة
    salesQueryRun("كرسي");
    const box = document.getElementById("sqResults");
    const opts = [...box.querySelectorAll('[role="option"]')];
    const dropVisible = !box.hidden && box.getBoundingClientRect().height > 0;
    // مرّر المنسدلة إلى آخرها ثم افحص آخر خيار: مرئيّ وفوق المؤشّرات (elementFromPoint يعيده)
    box.scrollTop = box.scrollHeight;
    let lastVisible = false, lastAbovePoint = "";
    if (opts.length) {
      const last = opts[opts.length - 1];
      const lr = last.getBoundingClientRect(), br = box.getBoundingClientRect();
      const insideBox = lr.bottom <= br.bottom + 1 && lr.top >= br.top - 1;   // ضمن حاوية التمرير (لا مقتطع بسلف)
      const cx = Math.round(lr.left + lr.width / 2), cy = Math.round(Math.min(lr.bottom - 3, lr.top + lr.height / 2));
      const hit = document.elementFromPoint(cx, cy);
      lastAbovePoint = hit ? (hit.id || hit.className || hit.tagName) : "null";
      lastVisible = insideBox && !!(hit && (hit === last || last.contains(hit) || box.contains(hit)));
    }
    const kpiTopAfterDrop = topOf("#salesKpis");
    // ⑥ تمرير أفقيّ
    const overflowOpen = document.documentElement.scrollWidth - window.innerWidth;
    sqClose();
    const overflowClosed = document.documentElement.scrollWidth - window.innerWidth;
    return { orderOK, defaultCompact, barH, touch, panelVisible, dropVisible, optCount: opts.length, lastVisible, lastAbovePoint, kpiTopBefore, kpiTopAfterAI, kpiTopAfterDrop, overflowOpen, overflowClosed };
  }, COLLAPSED);
  res.errs = errs.slice();
  await p.close();
  return res;
}

const d = await runAt(1200);
const m = await runAt(360);
await b.close();

const fails = [];
if (d.errs.length) fails.push("أخطاء JS (1200): " + d.errs.join(" | "));
if (m.errs.length) fails.push("أخطاء JS (360): " + m.errs.join(" | "));

if (BROKEN) {
  if (!d.defaultCompact) { console.log("✅ (--broken) G-COMPACT-TOOLS مسك التخطيط القديم: اللوحة/المنسدلة ظاهرتان افتراضياً (ليست مُدمجة)."); process.exit(0); }
  console.error("✗ (--broken) بقيت مُدمجة — لا أسنان."); process.exit(1);
}
if (CLIP) {
  if (!d.lastVisible) { console.log(`✅ (--broken-clip) G-COMPACT-TOOLS مسك الاقتطاع: آخر نتيجة محجوبة بسلف overflow:hidden (elementFromPoint=«${d.lastAbovePoint}»).`); process.exit(0); }
  console.error("✗ (--broken-clip) آخر نتيجة بقيت مرئية — لا أسنان."); process.exit(1);
}
if (COLLAPSED) {
  if (d.touch.chip === 0 || d.touch.input === 0 || !d.panelVisible) { console.log(`✅ (--broken-collapsed) G-COMPACT-TOOLS مسك القياس على لوحة مطويّة: أبعاد صفرية (chip=${d.touch.chip}·input=${d.touch.input}·panelVisible=${d.panelVisible}).`); process.exit(0); }
  console.error("✗ (--broken-collapsed) لم تكن الأبعاد صفرية — الحارس لا يفتح اللوحة فعلاً أو لا يقيس داخلها."); process.exit(1);
}

for (const [w, r] of [["1200", d], ["360", m]]) {
  if (!r.orderOK) fails.push(`(${w}) الترتيب مكسور: فلاتر ${r.kpiTopBefore != null ? "" : ""}top غير متصاعد (filters→tools→kpis)`);
  if (!r.defaultCompact) fails.push(`(${w}) الشكل الافتراضيّ ليس مُدمجاً (لوحة/منسدلة ظاهرة)`);
  if (r.barH < 50 || r.barH > 60) fails.push(`(${w}) ارتفاع الشريط ${r.barH}px خارج [50,60]`);
  for (const [k, v] of Object.entries(r.touch)) if (v < 32) fails.push(`(${w}) هدف اللمس «${k}» = ${v}px < 32`);
  if (!r.panelVisible) fails.push(`(${w}) لوحة المساعد لا تظهر بعد الفتح`);
  if (!r.dropVisible) fails.push(`(${w}) المنسدلة لا تظهر بعد البحث`);
  if (r.optCount !== 40) fails.push(`(${w}) عدد الخيارات ${r.optCount} ≠ 40`);
  if (!r.lastVisible) fails.push(`(${w}) 🚨 آخر نتيجة غير مرئية/مقتطعة أو محجوبة بمؤشّر (elementFromPoint=«${r.lastAbovePoint}»)`);
  if (r.overflowOpen > 1) fails.push(`(${w}) تمرير أفقيّ مع منسدلة مفتوحة: ${r.overflowOpen}px`);
  if (r.overflowClosed > 1) fails.push(`(${w}) تمرير أفقيّ مغلقاً: ${r.overflowClosed}px`);
  // ⑦ المؤشّرات لا تُزاح بفتح اللوحة العائمة (تسامح 1px)
  if (r.kpiTopBefore != null && r.kpiTopAfterAI != null && Math.abs(r.kpiTopAfterAI - r.kpiTopBefore) > 1) fails.push(`(${w}) فتح المساعد أزاح المؤشّرات ${Math.round(r.kpiTopAfterAI - r.kpiTopBefore)}px`);
  if (r.kpiTopBefore != null && r.kpiTopAfterDrop != null && Math.abs(r.kpiTopAfterDrop - r.kpiTopBefore) > 1) fails.push(`(${w}) فتح المنسدلة أزاح المؤشّرات ${Math.round(r.kpiTopAfterDrop - r.kpiTopBefore)}px`);
}

if (fails.length) { console.error("✗ G-COMPACT-TOOLS:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-COMPACT-TOOLS: الترتيب فلاتر→أدوات→مؤشّرات · مُدمج افتراضياً · الشريط ${d.barH}px(1200)/${m.barH}px(360) · اللمس ≥32 · آخر نتيجة مرئية فوق المؤشّرات · بلا تمرير أفقيّ · اللوحة عائمة لا تُزيح المؤشّرات.`);
