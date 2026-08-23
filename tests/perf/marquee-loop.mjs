// ============================================================================
// حارس تدفّق الشريط المتحرّك (§٦) — عرض المسار ≥ ضعف عرض الحاوية دائماً.
// وإلا: النسختان لا تملآن الحاوية فتظهر فجوة ويبدو الشريط متوقّفاً (العطل الأصلي).
// يختبر صراحةً: صنف واحد · ثلاثة · ثلاثون — عند 1280 (الأسوأ للعدد القليل) و390.
//
// HTML_PATH=<ملف> لتشغيله على نسخة أخرى (إثبات الرسوب على ما قبل الإصلاح).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8");
function findChrome() {
  const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", process.env.CHROME_PATH || "", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"];
  for (const x of c) if (x && existsSync(x)) return x;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {}
  return "";
}
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const fails = [];
for (const w of [1280, 390]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 800, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on("request", req => { const u = req.url(); if (u.startsWith("data:") || u.startsWith("about:")) return req.continue(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
  await page.setContent(html, { waitUntil: "load" });
  await new Promise(r => setTimeout(r, 250));
  for (const n of [1, 3, 30]) {
    // يحاكي مسار run: يُرسَم الشريط و#result مخفيّ ثم يُظهَر (فخّ القياس والحاوية مخفيّة) — الإصلاح يعيد الرسم عبر ResizeObserver
    await page.evaluate((count) => {
      const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
      try { goPage("home"); } catch {}
      const items = [];
      for (let i = 0; i < count; i++) items.push({ z: { sku: "S" + i, name: "صنف تجريبي " + i, barcode: "628120000" + i, price: 500 - i, published: i % 2 ? "Yes" : "No" }, isAbsent: false, reappeared: false, wasLinked: false });
      batchData = { green: items, yellow: [], red: [], total: count, lostCount: 0, needCount: count, absentCount: 0 };
      lastAutoUnpub = new Set();
      const res = document.getElementById("result");
      if (res) res.style.display = "none";   // مخفيّ وقت الرسم (كما في run)
      renderMarquee();
      if (res) res.style.display = "block";   // ثم يُظهره run ⇒ ResizeObserver يعيد الرسم بقياس صحيح
    }, n);
    await new Promise(r => setTimeout(r, 260));   // مهلة ResizeObserver
    const res = await page.evaluate(() => {
      const track = document.getElementById("mqTrack");
      const cont = document.querySelector("#marquee .mq-viewport") || document.getElementById("marquee");
      return { tw: Math.round(track ? track.getBoundingClientRect().width : 0), cw: Math.round(cont ? cont.getBoundingClientRect().width : 0), items: track ? track.querySelectorAll(".mq-item").length : 0 };
    });
    const ratio = res.cw ? +(res.tw / res.cw).toFixed(2) : 0;
    if (res.items <= 0) fails.push(`@${w}px · ${n} صنف: الشريط بلا عناصر (بدون ربط>0)`);   // العطل: شريط فارغ
    else if (res.tw < 2 * res.cw) fails.push(`@${w}px · ${n} صنف: مسار=${res.tw}px < ضعف الحاوية ${res.cw}px (فجوة)`);
    else if (res.tw > 40000) fails.push(`@${w}px · ${n} صنف: مسار=${res.tw}px انفجار (قياس والحاوية مخفيّة ⇒ طبقة تتجاوز حدّ GPU)`);
    else console.log(`✓ @${w}px · ${n} صنف: عناصر=${res.items} · مسار ${res.tw}px (${ratio}×) — ضمن [2× , 40000px]`);
  }
  await page.close();
}
await browser.close();
if (fails.length) { console.error("✗ عطل الشريط المتحرّك (عناصر/فجوة/انفجار):\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ §٦ الشريط: عناصر>0 والمسار ضمن [2× , 40000px] في كل الحالات (1·3·30) — بلا فجوة ولا انفجار.");
