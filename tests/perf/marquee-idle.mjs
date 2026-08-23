// ============================================================================
// حارس خمول الشريط المتحرّك (§٦) — يقيس **الظاهرة** (استمرارية الحركة) لا البنية.
// العطل: كل renderMarquee يعيد كتابة track.innerHTML ⇒ عنصر مسار جديد ⇒ حركة CSS
// تُستأنف من translateX(0). فإن تكرّر الرسم (Supabase SIGNED_IN · ResizeObserver ·
// run(true)) لا تتجاوز الحركة أول عنصرين ⇒ «صنفان يعبران» بينما DOM فيه 30.
// (مرّ على أربع نسخ من الحارس لأنها قاست الطول/العدد/البنية لا الحركة.)
//
// المقياس (طلب المستخدم): بعد إعادة الرسم **بنفس البيانات**، عنصر .mq-item الأول
//   **هو نفسه لم يُستبدل** (وسم يبقى) ⇒ innerHTML لم يُكتب ⇒ الحركة لم تُصفَّر.
//   وعند **تغيّر** البيانات (قرار يُسقط صنفاً) ⇒ يُعاد البناء (الوسم يزول) ⇒ لا بيات.
//   والتسمية بالعدد الحيّ تُحدَّث دائماً (حتى حين يبقى المسار محفوظاً).
//
// --broken / HTML_PATH=<نسخة قبل الإصلاح>: renderMarquee يعيد الكتابة دائماً ⇒
//   الوسم يزول حتى بنفس البيانات ⇒ الحارس يرسب (إثبات الأسنان على الحالة الحالية).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const src = BROKEN
  ? execFileSync("git", ["show", "HEAD:index.html"], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString()   // النسخة قبل الإصلاح
  : readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8");
function findChrome() {
  const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", process.env.CHROME_PATH || "", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"];
  for (const x of c) if (x && existsSync(x)) return x;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {}
  return "";
}
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
await page.setRequestInterception(true);
page.on("request", req => { const u = req.url(); if (u.startsWith("data:") || u.startsWith("about:")) return req.continue(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
await page.setContent(src, { waitUntil: "load" });
await new Promise(r => setTimeout(r, 250));

const res = await page.evaluate(() => {
  const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
  try { goPage("home"); } catch {}
  document.getElementById("result").style.display = "block";
  const mkItems = n => Array.from({ length: n }, (_, i) => ({ z: { sku: "S" + i, name: "صنف " + i, barcode: "628" + i, price: 900 - i, published: i % 2 ? "Yes" : "No" }, isAbsent: false, reappeared: false, wasLinked: false }));
  const set = (green, need) => { batchData = { green, yellow: [], red: [], total: green.length, lostCount: 0, needCount: need, absentCount: 0 }; lastAutoUnpub = new Set(); };
  const track = document.getElementById("mqTrack");
  const first = () => track.querySelector(".mq-item");
  const tag = () => { const f = first(); if (f) f.dataset.probe = "P"; };
  const survived = () => { const f = first(); return !!(f && f.dataset.probe === "P"); };
  const label = () => (document.querySelector("#marquee .mq-label") || {}).textContent || "";
  const out = {};

  // أ) خمول على نفس البيانات (منزلق، 30): إعادة الرسم لا تستبدل المسار
  set(mkItems(30), 30); renderMarquee();
  tag(); renderMarquee();
  out.sameData_slide = survived();

  // ب) تغيّر التسمية فقط (نفس الـSKUs): المسار محفوظ + التسمية تُحدَّث
  batchData.needCount = 25; renderMarquee();
  out.labelOnly_survived = survived();
  out.labelOnly_text = label();

  // ج) تغيّر البيانات فعلاً (قرار أسقط صنفاً من الأعلى): يُعاد البناء (لا بيات)
  set(mkItems(30).slice(1), 29); renderMarquee();   // SKUs مختلفة (سقط S0)
  out.dataChanged_rebuilt = !survived();
  out.dataChanged_text = label();

  // د) خمول على القلّة (ساكن، 4): إعادة الرسم لا تستبدل
  set(mkItems(4), 4); renderMarquee();
  tag(); renderMarquee();
  out.sameData_static = survived();
  out.static_isStatic = document.getElementById("marquee").classList.contains("mq-static");
  return out;
});
await browser.close();

const fails = [];
if (!res.sameData_slide) fails.push("منزلق: إعادة الرسم بنفس البيانات استبدلت المسار (الحركة تُصفَّر) — لا خمول");
if (!res.sameData_static) fails.push("ساكن (≤6): إعادة الرسم بنفس البيانات استبدلت المسار — لا خمول");
if (!res.labelOnly_survived) fails.push("تغيّر التسمية وحدها استبدل المسار (يجب تحديث التسمية بلا لمس track)");
if (!res.labelOnly_text.includes("(25)")) fails.push(`التسمية لم تُحدَّث للعدد الحيّ بعد تغيّر needCount (=«${res.labelOnly_text}»)`);
if (!res.dataChanged_rebuilt) fails.push("تغيّر البيانات (سقوط صنف) لم يُعِد البناء — الشريط بائت يعرض بيانات قديمة");
if (!res.dataChanged_text.includes("(29)")) fails.push(`التسمية لم تعكس البيانات الجديدة (=«${res.dataChanged_text}»)`);

if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) الحارس مسك العطل على النسخة الحالية: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) الحارس لم يرسب على النسخة قبل الإصلاح — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ خمول الشريط المتحرّك:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ §٦ خمول الشريط: نفس البيانات ⇒ المسار محفوظ (الحركة مستمرّة) · التسمية تُحدَّث دائماً · تغيّر البيانات ⇒ إعادة بناء (لا بيات).");
