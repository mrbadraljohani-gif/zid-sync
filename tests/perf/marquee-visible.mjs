// ============================================================================
// حارس رؤية الشريط المتحرّك (§٦) — يقيس **الظاهرة**: هل تعبر العناصر الـviewport فعلاً
// عبر دورة كاملة، لا مجرّد وجودها في DOM أو حركتها.
//
// العطل (من صفحة المستخدم): 60 عنصراً في DOM، الحركة تعمل، لكن كلها عند x سالب
// (يسار الـviewport) — لأن اتجاه الـviewport rtl يلصق المسار يميناً بلا فائض يمينيّ،
// فينزلق يساراً ويفرغ معظم الدورة (occ عبر الدورة = [5,0,0,0,0]). فحص الـDOM/الحركة
// يمرّ بينما لا شيء مرئي. مرّ على خمس نسخ من الحارس (طول · تنوّع · بنية · خمول).
//
// المقياس (طلب المستخدم): يخطو translateX يدوياً عبر دورة كاملة (0 → -setW) ويجمع
//   الأصناف المتمايزة (بالـSKU) التي تعبر الـviewport فعلياً. يرسب إن:
//   (أ) أول رسم لا ينتج .mq-item > 0 (شرط أساسي — بلا عناصر كل المقاييس فراغ)، أو
//   (ب) المتمايزة العابرة < min(30, needCount+absentCount) [حالة الانزلاق >6], أو
//   (ج) أي خطوة في الدورة أظهرت 0 عنصر (فجوة — الـviewport فرغ).
//
// --broken: يزيل `direction: ltr` من .mq-viewport (العلامة /* mq-fill */) فيعود
//   العطل ⇒ الحارس يرسب. مستقلّ عن git.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const FILL = "direction: ltr; /* mq-fill */";
let src = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  if (!src.includes(FILL)) { console.error("✗ (--broken) لم أجد علامة mq-fill لإزالتها — تغيّر الكود؟"); process.exit(2); }
  src = src.replace(FILL, "/* mq-fill removed */");   // أعِد عطل تموضع RTL
}
function findChrome() {
  const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", process.env.CHROME_PATH || "", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"];
  for (const x of c) if (x && existsSync(x)) return x;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {}
  return "";
}
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const fails = [];
for (const w of [1200, 835]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 800, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on("request", req => { const u = req.url(); if (u.startsWith("data:") || u.startsWith("about:")) return req.continue(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
  await page.setContent(src, { waitUntil: "load" });
  await new Promise(r => setTimeout(r, 250));
  const res = await page.evaluate(() => {
    const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
    try { goPage("home"); } catch {}
    document.getElementById("result").style.display = "block";
    const N = 30;
    const items = Array.from({ length: N }, (_, i) => ({ z: { sku: "S" + i, name: "منتج " + i, barcode: "628" + i, price: 900 - i, published: i % 2 ? "Yes" : "No" }, isAbsent: false, reappeared: false, wasLinked: false }));
    batchData = { green: items, yellow: [], red: [], total: N, lostCount: 0, needCount: N, absentCount: 0 };
    lastAutoUnpub = new Set();
    renderMarquee();
    const el = document.getElementById("marquee"), tr = document.getElementById("mqTrack"), vp = el.querySelector(".mq-viewport");
    const firstItems = tr.querySelectorAll(".mq-item").length;   // (أ) الشرط الأساسي: أول رسم أنتج عناصر
    const pop = batchData.needCount + batchData.absentCount;
    // (ب/ج): خطُ الدورة يدوياً — عطّل الحركة، حرّك translateX من 0 إلى -setW بخطوات، اجمع الـSKUs العابرة
    tr.style.animation = "none";
    const setW = tr.querySelector(".mq-set") ? tr.querySelector(".mq-set").getBoundingClientRect().width : 0;
    const seen = new Set(); const perStep = [];
    const STEPS = 24;
    for (let s = 0; s <= STEPS; s++) {
      tr.style.transform = `translateX(${-(s / STEPS) * setW}px)`;
      const r = vp.getBoundingClientRect(); let c = 0;
      tr.querySelectorAll(".mq-item").forEach(it => { const q = it.getBoundingClientRect(); if (q.right > r.left + 2 && q.left < r.right - 2) { c++; const oc = it.getAttribute("onclick") || ""; seen.add(oc); } });
      perStep.push(c);
    }
    tr.style.transform = "";
    return { firstItems, pop, distinct: seen.size, minOcc: Math.min(...perStep), setW: Math.round(setW), vpW: Math.round(vp.getBoundingClientRect().width) };
  });
  await page.close();
  const expected = Math.min(30, res.pop);
  if (res.firstItems <= 0) { fails.push(`@${w}: أول رسم أنتج 0 عنصر (.mq-item) — لا شريط أصلاً`); continue; }
  if (res.minOcc <= 0) fails.push(`@${w}: الـviewport فرغ في خطوة من الدورة (occ الأدنى=${res.minOcc}) — فجوة/انزلاق خارج الرؤية`);
  else if (res.distinct < expected) fails.push(`@${w}: عبَر ${res.distinct} صنفاً متمايزاً فقط عبر الدورة < min(30,${res.pop})=${expected}`);
  else console.log(`✓ @${w}: أول رسم=${res.firstItems} عنصر · عبَر ${res.distinct}/${expected} عبر الدورة · أدنى إشغال=${res.minOcc} (لا فجوة) · setW=${res.setW}/vp=${res.vpW}`);
}
await browser.close();
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) الحارس مسك عطل التموضع: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إزالة mq-fill — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ رؤية الشريط المتحرّك (فجوة/عناصر خارج الرؤية):\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ §٦ رؤية الشريط: أول رسم ينتج عناصر · المتمايزة العابرة == min(30, المجتمع) · لا فجوة عبر الدورة كاملةً.");
