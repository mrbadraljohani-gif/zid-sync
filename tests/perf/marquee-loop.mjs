// ============================================================================
// حارس الشريط المتحرّك (§٦) — التنوّع لا الطول.
// العطل القديم للحارس: كان يقيس عرض المسار (الطول) فيمرّ حتى لو كرّر عنصرين
// حتى يملأ العرض — فأوهم بشريط ممتلئ ومحتواه ٢-٣. القاعدة الصحيحة:
//   العناصر الفريدة (لا المكرّرة) == min(30, needCount + absentCount)
//   لا الطول، ولا عدّاد بطاقة «بدون ربط» (الذي يشمل المُدار/المتجاهَل/⏳).
// ＋ سلوك القلّة (≤6 عناصر): نسخة واحدة ساكنة — صفر تكرار (mq-set == 1، بلا انزلاق).
//   >6 ⇒ انزلاق ديناميكي (المسار ≥ ضعف الحاوية، بلا فجوة ولا انفجار GPU).
//   0 ⇒ الشريط مخفيّ كلياً. ＋ التسمية تعرض العدد الحيّ «تحتاج قرارك (N)».
// الحدّان: 6 بالضبط ⇒ ساكن · 7 ⇒ انزلاق (لا فجوة ولا تداخل عند الحدّ).
//
// --broken: يقتطع القائمة المرسومة (buildMarqueeData→slice) مع إبقاء العدّاد كبيراً،
//   فتُملأ الحاوية بالتكرار لكن الفريدة أقلّ من min(30,pop) — ويُتحقَّق أن الحارس يرسب.
//   (إثبات الأسنان: الحارس القديم كان يمرّ هنا؛ الجديد يمسكه.)
// HTML_PATH=<ملف> لتشغيله على نسخة أخرى.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const BROKEN = process.argv.includes("--broken");
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8");
function findChrome() {
  const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", process.env.CHROME_PATH || "", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"];
  for (const x of c) if (x && existsSync(x)) return x;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {}
  return "";
}

// يرسم الشريط لـ N صنفاً «يحتاج قرارك» (كلها green) عبر مسار run (مخفيّ→ظاهر→ResizeObserver)
// truncateTo: يقتطع مخرج buildMarqueeData (لمحاكاة عطل اقتطاع) مع إبقاء العدّاد N — للأسنان.
async function renderN(page, N, truncateTo) {
  await page.evaluate((count, trunc) => {
    const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
    try { goPage("home"); } catch {}
    const items = [];
    for (let i = 0; i < count; i++) items.push({ z: { sku: "S" + i, name: "صنف تجريبي " + i, barcode: "628120000" + i, price: 900 - i, published: i % 2 ? "Yes" : "No" }, isAbsent: false, reappeared: false, wasLinked: false });
    // batchData هو مصدر الحقيقة: green=كل الأصناف، needCount=N (المجتمع الفعلي = needCount+absentCount)
    batchData = { green: items, yellow: [], red: [], total: count, lostCount: 0, needCount: count, absentCount: 0 };
    lastAutoUnpub = new Set();
    if (trunc != null) { const _o = buildMarqueeData; buildMarqueeData = () => _o().slice(0, trunc); }   // عطل مُصطنع: القائمة تُقتطع لكن العدّاد يبقى N
    const res = document.getElementById("result");
    if (res) res.style.display = "none";   // مخفيّ وقت الرسم (كما في run)
    renderMarquee();
    if (res) res.style.display = "block";   // ثم يُظهره run ⇒ ResizeObserver يعيد رسم الانزلاق بقياس صحيح
  }, N, truncateTo);
  await new Promise(r => setTimeout(r, 280));   // مهلة ResizeObserver
  return page.evaluate(() => {
    const el = document.getElementById("marquee"), track = document.getElementById("mqTrack");
    const cont = document.querySelector("#marquee .mq-viewport") || el;
    const nm = [...track.querySelectorAll(".mq-nm")].map(x => x.textContent);
    const lbl = (el.querySelector(".mq-label") || {}).textContent || "";
    return {
      hidden: getComputedStyle(el).display === "none" || el.style.display === "none",
      sets: track.querySelectorAll(".mq-set").length,
      items: track.querySelectorAll(".mq-item").length,
      unique: new Set(nm).size,
      isStatic: el.classList.contains("mq-static"),
      pop: batchData ? (batchData.needCount + batchData.absentCount) : 0,
      label: lbl,
      tw: Math.round(track.getBoundingClientRect().width),
      cw: Math.round(cont.getBoundingClientRect().width),
    };
  });
}

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const fails = [];

// ── الأسنان: عطل اقتطاع (القائمة 2، العدّاد 30) — يجب أن يرسب الحارس ──
if (BROKEN) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on("request", req => { const u = req.url(); if (u.startsWith("data:") || u.startsWith("about:")) return req.continue(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
  await page.setContent(html, { waitUntil: "load" });
  await new Promise(r => setTimeout(r, 250));
  const r = await renderN(page, 30, 2);   // pop=30 لكن المرسوم مقتطع إلى 2
  const expected = Math.min(30, r.pop);
  const caught = r.unique !== expected;   // نفس فحص التنوّع الذي يطبّقه الوضع العادي
  await page.close(); await browser.close();
  if (caught) { console.log(`✅ (--broken) الحارس مسك الاقتطاع: فريدة=${r.unique} ≠ المتوقّع=${expected} (العدّاد ${r.pop}). القديم كان يمرّ (المسار ملأه التكرار).`); process.exit(0); }
  console.error(`✗ (--broken) الحارس أعمى: فريدة=${r.unique} == المتوقّع=${expected} رغم الاقتطاع — لا أسنان.`); process.exit(1);
}

// ── الوضع العادي: التنوّع + سلوك القلّة/الانزلاق + الحدّان + التسمية ──
for (const w of [1280, 390]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 800, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on("request", req => { const u = req.url(); if (u.startsWith("data:") || u.startsWith("about:")) return req.continue(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
  await page.setContent(html, { waitUntil: "load" });
  await new Promise(r => setTimeout(r, 250));
  // 0 ⇒ مخفيّ · 1·3·6 ⇒ ساكن نسخة واحدة · 7·30·50 ⇒ انزلاق مع تنوّع مسقوف 30
  for (const N of [0, 1, 3, 6, 7, 30, 50]) {
    const r = await renderN(page, N);
    const expected = Math.min(30, r.pop);
    if (N === 0) {
      if (!r.hidden) fails.push(`@${w} · 0 صنف: الشريط ظاهر (يجب إخفاؤه كلياً — لا تنبيه بلا محتوى)`);
      else console.log(`✓ @${w} · 0 صنف: مخفيّ كلياً`);
      continue;
    }
    // التنوّع: الفريدة == min(30, needCount+absentCount) — القاعدة الجوهرية
    if (r.unique !== expected) fails.push(`@${w} · ${N} صنف: فريدة=${r.unique} ≠ min(30,pop)=${expected} (الطول ${r.items} — تكرار يخفي القلّة)`);
    // التسمية بالعدد الحيّ
    else if (!r.label.includes(`(${r.pop})`)) fails.push(`@${w} · ${N} صنف: التسمية «${r.label}» لا تحمل العدد الحيّ (${r.pop})`);
    else if (N <= 6) {
      // القلّة: نسخة واحدة، صفر تكرار، ساكن
      if (r.sets !== 1) fails.push(`@${w} · ${N} صنف (≤6): نسخ=${r.sets} ≠ 1 (تكرار عند القلّة يوهم بالعطل)`);
      else if (!r.isStatic) fails.push(`@${w} · ${N} صنف (≤6): ليس ساكناً (mq-static غائب — سينزلق العنصران بلا انقطاع)`);
      else if (r.items !== N) fails.push(`@${w} · ${N} صنف (≤6): مرسوم=${r.items} ≠ ${N} (يجب عرض كلها لا اقتطاعها)`);
      else console.log(`✓ @${w} · ${N} صنف: ساكن · نسخة واحدة · فريدة=${r.unique} · «${r.label}»`);
    } else {
      // الكثرة: انزلاق — نسختان فأكثر، المسار ≥ ضعف الحاوية، لا انفجار
      if (r.isStatic || r.sets < 2) fails.push(`@${w} · ${N} صنف (>6): ساكن/نسخة واحدة (نسخ=${r.sets}) — يجب الانزلاق`);
      else if (r.tw < 2 * r.cw) fails.push(`@${w} · ${N} صنف (>6): مسار=${r.tw} < ضعف الحاوية ${r.cw} (فجوة)`);
      else if (r.tw > 40000) fails.push(`@${w} · ${N} صنف (>6): مسار=${r.tw} انفجار (طبقة تتجاوز حدّ GPU)`);
      else console.log(`✓ @${w} · ${N} صنف: انزلاق · نسخ=${r.sets} · فريدة=${r.unique}/${expected} · مسار ${r.tw}px (${(r.tw / r.cw).toFixed(2)}×) · «${r.label}»`);
    }
  }
  await page.close();
}
await browser.close();
if (fails.length) { console.error("✗ عطل الشريط المتحرّك (تنوّع/قلّة/تسمية/انزلاق):\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ §٦ الشريط: الفريدة == min(30, needCount+absentCount) · ≤6 ساكن نسخة واحدة · >6 انزلاق · 0 مخفيّ · التسمية بالعدد الحيّ.");
