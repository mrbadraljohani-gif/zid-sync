// ============================================================================
// حارس التجاوز الأفقي عند 360/390 — عرض حقيقي عبر puppeteer-core + CDP.
// السبب: Chrome headless عبر --dump-dom يثبّت innerWidth عند 500 (لا يمكن قياس
// 360/390 الحقيقيَّين ولا قواعد @media). puppeteer-core يقود Chrome النظامي
// ويضبط العرض الحقيقي بـsetViewport (Emulation.setDeviceMetricsOverride).
//
// تشغيل:  node tests/perf/overflow-guard.mjs           (يرسب عند أي تجاوز أفقي)
//         node tests/perf/overflow-guard.mjs --broken  (تحقّق ذاتي: يجب أن يرسب)
//
// ⚠️ منهجية CLAUDE.md: الاختبار الذي لا يرسب على الكود المعطوب لا يثبت شيئاً.
//    وضع --broken يحقن بطاقة ذات عنصر 900px ليؤكّد أن الحارس يلتقط التجاوز فعلاً.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const css = (readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n").match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
const BROKEN = process.argv.includes("--broken");
const WIDTHS = [360, 390];

function findChrome() {
  const cands = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", process.env.CHROME_PATH || "",
  ];
  for (const c of cands) if (c && existsSync(c)) return c;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"])
    try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {}
  return "";
}

// بطاقة كاملة مطابِقة لبنية batchCardHTML (صورة · نصّان · combo · checkbox · زرّان) — مع اسم طويل بلا فراغات لاختبار الانضغاط
const NAME = "طقمجلسةالفخامةمعتكايةمقاس٧٥سنتيمترلونمخصّصطويلجداًبلافراغاتلاختبارالالتفاف";
const fullCard = (i, extra = "") => `<div class="mcard batch-card${i % 7 === 0 ? " lost" : ""}">
  <div class="mc-zid"><span class="mc-tag zid">ZID PRODUCT</span>
    <div class="mc-row"><span class="thumb thumb-ph">📦</span><div class="mc-txt">
      <div class="mc-name">${NAME} ${i}</div>
      <div class="mc-sku">SKU: <span dir="ltr">451070${i}.${i % 4}</span>${i % 7 === 0 ? '<span class="lost-tag">🔗 سبق ربطه</span>' : ""}</div>
      <div class="mc-sub">سعر زد: 125 ر.س · الكمية: <b>${i % 9}</b> <span class="pub-badge on"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"></svg> منشور <span class="pub-arrow">← سيُخفى</span></span></div>
    </div></div></div>
  <div class="mc-wh"><span class="mc-tag whs">WAREHOUSE</span>
    <div><div class="mc-name">مباخر مكس ${i}</div><div class="mc-sku">باركود المستودع: <span dir="ltr">4512${100 + i}</span></div><div class="mc-sub">سعر المستودع: 30 ر.س · الكمية: <b>${i % 20}</b></div></div>
    <div class="bt-combo"><input class="bt-search" placeholder="غيّر/ابحث في المستودع بالكود أو الاسم…"></div>
  </div>
  <div class="mc-actions">${extra}
    <label class="bt-card-chk"><input type="checkbox" checked><span>اعتماد</span></label>
    <button class="mc-btn wait">⏳ غير متوفر</button>
    <button class="mc-btn ignore">✕ تجاهل</button>
  </div></div>`;
// صفّ خفيف مطابِق لـunifiedLightRow في ب-٢ (نفس الأصناف: mcard uni-light)
const lightRow = i => `<div class="mcard uni-light" data-status="managed">
  <div class="mc-zid"><div class="mc-row"><div class="mc-txt">
    <div class="mc-name">صنف مُدار ${i} <span class="cat-badge cat-mng">✓ مُدار</span> <span class="pub-badge off"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"></svg> غير منشور</span></div>
    <div class="mc-sku">SKU: <span dir="ltr">451070${i}</span></div></div></div></div>
  <div class="mc-actions"><button class="mc-btn">↩ تراجع</button></div></div>`;
// شريط الحالة اللاصق (uni-bar) كما في ب-٢ — لاختبار «لاصق معتم» + عدم التجاوز
const uniBar = `<div class="uni-bar"><div class="uni-counts"><b class="uni-need">🆕 يحتاج قرار 24</b> <span class="uni-conf">● 12 · ● 8 · ● 4</span> · <span class="uni-st">⚠ سيُصفَّر 3</span> · <span class="uni-st">✓ مُدار 24</span></div>
  <div class="uni-actions"><button class="btn-run sm">✓ اعتماد المؤكد</button><button class="mc-btn">✓ اعتماد كل المحدد</button></div></div>`;

const cards = uniBar + Array.from({ length: 24 }, (_, i) => fullCard(i)).join("")
  + Array.from({ length: 24 }, (_, i) => lightRow(i)).join("")
  + (BROKEN ? fullCard(999, '<div style="width:900px;flex:0 0 auto"></div>') : "");   // بطاقة معطوبة للتحقّق الذاتي

const page = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>
<body class="app-shell"><div class="mcards uni-list">${cards}</div></body></html>`;

const exe = findChrome();
if (!exe) { console.error("✗ لم يُعثر على Chrome. اضبط CHROME_PATH."); process.exit(2); }

const browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const fails = [];
try {
  for (const w of WIDTHS) {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: 800, deviceScaleFactor: 2, isMobile: true });
    await p.setContent(page, { waitUntil: "load" });
    const r = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const docOverflow = document.documentElement.scrollWidth - vw;
      // أوسع عنصر يتجاوز حدود العرض (RTL: يمتدّ يميناً بعد العرض أو يساراً قبل 0)
      let worst = null, worstOv = 0;
      for (const el of document.querySelectorAll(".mcards *")) {
        const rc = el.getBoundingClientRect();
        const ov = Math.max(0, Math.round(rc.right - vw), Math.round(-rc.left));
        if (ov > worstOv) { worstOv = ov; worst = (el.className || el.tagName) + " «" + (el.textContent || "").slice(0, 24) + "»"; }
      }
      // حارس «لاصق معتم»: شريط uni-bar sticky يجب أن تكون خلفيته غير شفّافة (alpha=1) وإلا يشفّ المحتوى تحته
      const bar = document.querySelector(".uni-bar");
      let stickyOpaque = true, barBg = "";
      if (bar) {
        const cs = getComputedStyle(bar);
        barBg = cs.backgroundColor + " | " + cs.backgroundImage.slice(0, 40);
        const solidColor = cs.backgroundColor && !/rgba\([^)]*,\s*0(\.0+)?\)/.test(cs.backgroundColor) && cs.backgroundColor !== "transparent";
        const hasBgImage = cs.backgroundImage && cs.backgroundImage !== "none";   // طبقة linear-gradient(panel) فوق bg = معتم
        stickyOpaque = (cs.position === "sticky") && (solidColor || hasBgImage);
      }
      return { vw, docOverflow: Math.round(docOverflow), worstOv, worst, stickyOpaque, barBg };
    });
    const bad = r.docOverflow > 1 || r.worstOv > 1;
    console.log(`  ${bad ? "✗" : "✓"} @${w}px · vw=${r.vw} · docOverflow=${r.docOverflow}px · أسوأ عنصر=${r.worstOv}px · لاصق-معتم=${r.stickyOpaque} ${r.worst ? "(" + r.worst + ")" : ""}`);
    if (bad) fails.push(`تجاوز أفقي @${w}px (docOverflow=${r.docOverflow}, عنصر=${r.worstOv})`);
    if (!BROKEN && !r.stickyOpaque) fails.push(`شريط uni-bar اللاصق ليس معتماً @${w}px (${r.barBg})`);
    await p.close();
  }
} finally { await browser.close(); }

if (BROKEN) {
  if (fails.length) { console.log("\n✅ التحقّق الذاتي: الحارس رسب على البطاقة المعطوبة (كما يجب)."); process.exit(0); }
  console.error("\n✗ خلل منهجي: الحارس لم يرسب على الكود المعطوب — لا يثبت شيئاً!"); process.exit(1);
}
if (fails.length) { console.error("\n✗ فشل حارس التجاوز الأفقي:\n" + fails.map(f => "  ✗ " + f).join("\n")); process.exit(1); }
console.log("\n✅ لا تجاوز أفقي عند 360/390.");
