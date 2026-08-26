// ============================================================================
// حارس الرسم الدائري (توزيع المنتجات) — مجموع شرائح الأسطورة == إجمالي المركز تماماً، بلا بقايا.
// يحقن lastClassify، يستدعي renderInvPie، يجمع أعداد الأسطورة ويقارنها بعدد المركز.
// ＋ الحالة الفارغة: بلا lastClassify ⇒ رسالة لا دائرة صفرية.
// --broken: يحقن total ≠ مجموع الأجزاء ⇒ يجب أن يرسب (كشف البقايا غير المفسَّرة).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const BROKEN = process.argv.includes("--broken");
function findChrome() { const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", process.env.CHROME_PATH || "", "/usr/bin/google-chrome-stable"]; for (const x of c) if (x && existsSync(x)) return x; for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {} return ""; }
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
await page.setRequestInterception(true);
page.on("request", req => { const u = req.url(); if (u.startsWith("data:") || u.startsWith("about:")) return req.continue(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
await page.setContent(html, { waitUntil: "load" });
await new Promise(r => setTimeout(r, 300));

const res = await page.evaluate((broken) => {
  const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
  try { goPage("inventory"); } catch {}
  const out = {};
  // (1) الحالة الفارغة: بلا تصنيف ⇒ رسالة لا SVG
  lastClassify = null; renderInvPie();
  const host = document.getElementById("invPie");
  out.emptyHasSvg = !!host.querySelector("svg");
  out.emptyHasMsg = /شغّل/.test(host.textContent);
  // (2) حالة معطاة
  const parts = { matched: 100, unmatched: 40, collided: 5, absent: 20, parent: 15 };
  const sum = Object.values(parts).reduce((a, b) => a + b, 0);
  lastClassify = { ...parts, total: broken ? sum + 17 : sum };   // broken: إجمالي لا يطابق مجموع الأجزاء
  renderInvPie();
  const legend = [...host.querySelectorAll(".pie-lg b")].map(b => parseInt(b.textContent, 10) || 0);
  const legendSum = legend.reduce((a, b) => a + b, 0);
  const center = parseInt(host.querySelector(".pie-c-n").textContent, 10) || 0;
  out.legendSum = legendSum; out.center = center; out.slices = legend.length;
  return out;
}, BROKEN);
await browser.close();
const r = res;

// الحالة الفارغة يجب أن تكون رسالة لا دائرة
if (r.emptyHasSvg || !r.emptyHasMsg) { console.error("✗ الحالة الفارغة تعرض دائرة/بلا رسالة (يجب رسالة فقط)"); process.exit(1); }

if (BROKEN) {
  if (r.legendSum !== r.center) { console.log(`✅ [self] الحارس يرسب على الفرق: مجموع الأسطورة ${r.legendSum} ≠ المركز ${r.center}`); process.exit(0); }
  console.error("✗ [self] الحارس أعمى: لم يكشف فرق الإجمالي"); process.exit(1);
}
if (r.legendSum !== r.center) { console.error(`✗ مجموع شرائح الأسطورة (${r.legendSum}) ≠ إجمالي المركز (${r.center}) — بقايا غير مفسَّرة`); process.exit(1); }
console.log(`✅ الرسم الدائري: مجموع الشرائح (${r.legendSum}) == الإجمالي (${r.center}) — ${r.slices} شرائح، بلا بقايا؛ والحالة الفارغة رسالة.`);
