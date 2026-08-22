// ============================================================================
// حارس احتواء .mcard — أي عنصر داخل بطاقة القائمة يتجاوز حدود البطاقة ⇒ رسوب.
// السبب الجذري الذي يمسكه: صفّ أزرار الإجراءات (nowrap) عرضه min-content يتجاوز
// عرض البطاقة الضيّقة على الجوال، و.mcard بلا min-width:0 ينتفخ فيتجاوز الحاوية.
// التجاوز رأسي/احتوائي لا أفقي على مستوى الصفحة — فحارس overflow-guard لا يمسكه.
//
// puppeteer-core + Chrome النظامي · viewport حقيقي 360/390 (isMobile+coarse).
// HTML_PATH=<ملف> لتشغيله على نسخة أخرى (إثبات الرسوب على ما قبل الإصلاح).
// --broken: يحقن عنصراً بعرض 900px داخل .mcard ويؤكّد أن الحارس يمسكه.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const htmlPath = process.env.HTML_PATH || join(root, "index.html");
const html = readFileSync(htmlPath, "utf8");
const BROKEN = process.argv.includes("--broken");
const TOL = 2;   // تسامح بكسلين (::after هدف اللمس يتجاوز ~1.5px مشروعاً)

function findChrome() {
  const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", process.env.CHROME_PATH || "", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"];
  for (const x of c) if (x && existsSync(x)) return x;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {}
  return "";
}

const ROW = `<div class="mcards"><div class="mcard batch-card">
  <div class="mc-zid"><div class="mc-tag">ZID PRODUCT</div><b>كرسي خشب زان مبطّن فاخر بمسند</b><span class="bt-sku" dir="ltr">SKU: 80231</span><div class="mc-qtys">سعر: 480 · الكمية: 12</div></div>
  <div class="mc-mid">↔</div>
  <div class="mc-wh"><div class="mc-tag">WAREHOUSE</div><b>كرسي زان</b><span class="bt-sku" dir="ltr">80231</span></div>
  <div class="mc-actions"><button class="mc-btn bind gold">✓ اعتماد</button><button class="mc-btn" disabled>⏳ غير متوفر</button><button class="mc-btn ignore">✕ تجاهل</button></div>
</div></div>`;

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
let fails = [];
for (const w of [360, 390]) {
  const page = await browser.newPage();
  const client = await page.target().createCDPSession();
  await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "pointer", value: "coarse" }] });
  await page.setRequestInterception(true);
  page.on("request", req => { const u = req.url(); if (u.startsWith("data:") || u.startsWith("about:")) return req.continue(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
  await page.setContent(html, { waitUntil: "load" });
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate((rowHtml, broken) => {
    const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
    const box = document.createElement("div"); box.style.cssText = "padding:16px"; box.innerHTML = rowHtml;
    (document.querySelector(".page-wrap") || document.body).prepend(box);
    if (broken) { const bad = document.createElement("div"); bad.style.cssText = "width:900px;height:10px"; bad.className = "inject-overflow"; document.querySelector(".mcard").appendChild(bad); }
  }, ROW, BROKEN);
  await new Promise(r => setTimeout(r, 200));
  const over = await page.evaluate((tol) => {
    const card = document.querySelector(".mcard"); const cr = card.getBoundingClientRect();
    const out = [];
    card.querySelectorAll("*").forEach(el => {
      if (el.tagName === "svg" || el.closest("svg")) return;   // أيقونات SVG قد تتجاوز طفيفاً بلا أثر بصري
      const r = el.getBoundingClientRect();
      const over = Math.max(r.right - cr.right, cr.left - r.left, r.bottom - cr.bottom, cr.top - r.top);
      if (over > tol) out.push({ el: (el.className && el.className.toString().slice(0, 40)) || el.tagName, over: Math.round(over * 10) / 10 });
    });
    return out.slice(0, 6);
  }, TOL);
  if (over.length) fails.push(`@${w}px: ` + over.map(o => `${o.el}(+${o.over}px)`).join(" · "));
  else console.log(`✓ @${w}px · كل عناصر .mcard داخل حدودها`);
  await page.close();
}
await browser.close();

if (BROKEN) {
  if (fails.length) { console.log("✅ [self] الحارس يرسب على العنصر المحقون (900px):\n  " + fails.join("\n  ")); process.exit(0); }
  console.error("✗ [self] الحارس أعمى: لم يمسك عنصر 900px داخل .mcard"); process.exit(1);
}
if (fails.length) { console.error("✗ تجاوز احتواء داخل .mcard:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ لا تجاوز احتواء داخل .mcard عند 360/390.");
